import {
  createCipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  auditLogsTable,
  db,
  productsTable,
  securityAlertsTable,
  staffMembersTable,
  storesTable,
  whatsappEventsTable,
} from "@workspace/db";
import {
  GetWhatsAppConnectionParams,
  GetWhatsAppConnectionResponse,
  ReceiveWhatsAppWebhookBody,
  ReceiveWhatsAppWebhookResponse,
  SaveWhatsAppConnectionBody,
  SaveWhatsAppConnectionParams,
  SaveWhatsAppConnectionResponse,
  VerifyWhatsAppWebhookQueryParams,
} from "@workspace/api-zod";
import { writeAuditLog } from "../lib/audit";
import { serializeDates } from "../lib/serialize";
import { authorizeStoreAdmin, requireAuth, userProfileFromRequest } from "../middlewares/auth";
import { MAX_STOCK_QUANTITY, normalizePhone, parseStockCommand, signatureIsValid, verifyBusinessConnection, MetaConnectionError } from "../lib/whatsapp-security";

const router: IRouter = Router();
const authenticatedRouter: IRouter = Router();
authenticatedRouter.use(requireAuth);

function webhookReady(): boolean {
  return Boolean(
    process.env.WHATSAPP_APP_SECRET &&
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  );
}

function connectionStatus(store: {
  whatsappPhoneNumberId: string | null;
  whatsappWabaId: string | null;
  whatsappAccessTokenEncrypted: string | null;
  whatsappConnectedAt: Date | null;
}): "not_connected" | "awaiting_webhook_config" | "connected" {
  if (
    !store.whatsappPhoneNumberId ||
    !store.whatsappWabaId ||
    !store.whatsappAccessTokenEncrypted
  ) {
    return "not_connected";
  }
  if (!webhookReady() || !store.whatsappConnectedAt) {
    return "awaiting_webhook_config";
  }
  return "connected";
}

function encryptAccessToken(accessToken: string): {
  encrypted: string;
  iv: string;
  tag: string;
} {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("Secure credential storage is not configured.");
  }
  const key = createHash("sha256")
    .update(`ai-stock-whatsapp-token-v1:${sessionSecret}`)
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(accessToken, "utf8"),
    cipher.final(),
  ]);
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

interface MetaMessage {
  id?: string;
  from?: string;
  text?: { body?: string };
  timestamp?: string;
}

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: MetaMessage[];
      };
    }>;
  }>;
}

async function processMessage(
  storeId: string,
  message: MetaMessage,
  phoneNumberId: string,
): Promise<void> {
  const senderPhone = normalizePhone(message.from ?? "");
  const messageId = message.id;
  if (!senderPhone || !messageId) return;

  await db.transaction(async (tx) => {
    const [event] = await tx
      .insert(whatsappEventsTable)
      .values({
        storeId,
        messageId,
        senderPhone,
      })
      .onConflictDoNothing({ target: whatsappEventsTable.messageId })
      .returning({ id: whatsappEventsTable.id });
    if (!event) return;

    const [staff] = await tx.select().from(staffMembersTable).where(and(
      eq(staffMembersTable.storeId, storeId),
      eq(staffMembersTable.active, true),
      sql`regexp_replace(${staffMembersTable.phoneNumber}, '[^0-9]', '', 'g') = ${senderPhone}`,
    )).limit(1).for("share");

    const preview = (message.text?.body ?? "[non-text message]").slice(0, 300);
    if (!staff) {
      await tx.insert(securityAlertsTable).values({
        storeId,
        senderPhone: message.from ?? senderPhone,
        reason: "unauthorized_sender",
        messagePreview: preview,
      });
      return;
    }

    const command = parseStockCommand(message.text?.body ?? "");
    if (!command) return;

    const [product] = await tx
      .select()
      .from(productsTable)
      .where(
        and(
          eq(productsTable.storeId, storeId),
          eq(productsTable.batchNumber, command.batchNumber),
        ),
      )
      .limit(1).for("update");
    if (!product) {
      await tx.insert(securityAlertsTable).values({
        storeId,
        senderPhone: message.from ?? senderPhone,
        reason: "unknown_batch",
        messagePreview: preview,
      });
      return;
    }

    const nextQuantity =
      command.operation === "add"
        ? Number(product.quantity) + command.quantity
        : command.quantity;
    if (nextQuantity > MAX_STOCK_QUANTITY) {
      await tx.insert(securityAlertsTable).values({
        storeId, senderPhone, reason: "quantity_out_of_range", messagePreview: preview,
      });
      return;
    }
    const [updated] = await tx
      .update(productsTable)
      .set({
        quantity:
          command.operation === "add"
            ? sql`${productsTable.quantity} + ${command.quantity}`
            : String(command.quantity),
      })
      .where(
        and(
          eq(productsTable.id, product.id),
          eq(productsTable.storeId, storeId),
        ),
      )
      .returning();
    if (!updated) return;

    await tx.insert(auditLogsTable).values({
      storeId,
      action: "inventory.whatsapp_updated",
      targetType: "product",
      targetId: product.id,
      targetLabel: product.name,
      actorUserId: `whatsapp:${staff.id}`,
      actorName: staff.name,
      details: {
        batchNumber: product.batchNumber,
        operation: command.operation,
        previousQuantity: Number(product.quantity),
        newQuantity: nextQuantity,
        messageId,
        phoneNumberId,
      },
    });
    await tx
      .update(storesTable)
      .set({ whatsappConnectedAt: new Date() })
      .where(eq(storesTable.id, storeId));
  });
}

authenticatedRouter.get(
  "/stores/:storeId/whatsapp",
  async (req, res): Promise<void> => {
    const params = GetWhatsAppConnectionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!(await authorizeStoreAdmin(req, res, params.data.storeId))) return;
    const [store] = await db
      .select({
        whatsappPhone: storesTable.whatsappPhone,
        whatsappPhoneNumberId: storesTable.whatsappPhoneNumberId,
        whatsappWabaId: storesTable.whatsappWabaId,
        whatsappAccessTokenEncrypted: storesTable.whatsappAccessTokenEncrypted,
        whatsappConnectedAt: storesTable.whatsappConnectedAt,
      })
      .from(storesTable)
      .where(eq(storesTable.id, params.data.storeId))
      .limit(1);
    if (!store) {
      res.status(404).json({ error: "Store not found." });
      return;
    }
    const status = connectionStatus(store);
    res.json(
      GetWhatsAppConnectionResponse.parse(serializeDates({
        connected: status === "connected",
        phoneNumber: store.whatsappPhone,
        phoneNumberId: store.whatsappPhoneNumberId,
        wabaId: store.whatsappWabaId,
        status,
        webhookReady: webhookReady(),
        lastConnectedAt: store.whatsappConnectedAt,
      })),
    );
  },
);

authenticatedRouter.put(
  "/stores/:storeId/whatsapp",
  async (req, res): Promise<void> => {
    const params = SaveWhatsAppConnectionParams.safeParse(req.params);
    const parsed = SaveWhatsAppConnectionBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actorUserId = await authorizeStoreAdmin(
      req,
      res,
      params.data.storeId,
    );
    if (!actorUserId) return;

    const [claimedNumber] = await db.select({ id: storesTable.id }).from(storesTable)
      .where(and(eq(storesTable.whatsappPhoneNumberId, parsed.data.phoneNumberId), ne(storesTable.id, params.data.storeId))).limit(1);
    if (claimedNumber) {
      res.status(409).json({ error: "This WhatsApp business number is already connected to another store." });
      return;
    }
    try {
      await verifyBusinessConnection(parsed.data);
    } catch (error) {
      res.status(422).json({
        error: error instanceof MetaConnectionError ? error.message : "WhatsApp verification failed.",
      });
      return;
    }

    let encrypted: ReturnType<typeof encryptAccessToken>;
    try {
      encrypted = encryptAccessToken(parsed.data.accessToken);
    } catch {
      res.status(503).json({
        error: "Secure WhatsApp credential storage is not configured.",
      });
      return;
    }
    const [store] = await db
      .update(storesTable)
      .set({
        whatsappPhone: `+${normalizePhone(parsed.data.phoneNumber)}`,
        whatsappPhoneNumberId: parsed.data.phoneNumberId,
        whatsappWabaId: parsed.data.wabaId,
        whatsappAccessTokenEncrypted: encrypted.encrypted,
        whatsappAccessTokenIv: encrypted.iv,
        whatsappAccessTokenTag: encrypted.tag,
        whatsappConnectedAt: null,
      })
      .where(eq(storesTable.id, params.data.storeId))
      .returning({
        id: storesTable.id,
        whatsappPhone: storesTable.whatsappPhone,
        whatsappPhoneNumberId: storesTable.whatsappPhoneNumberId,
        whatsappWabaId: storesTable.whatsappWabaId,
        whatsappAccessTokenEncrypted: storesTable.whatsappAccessTokenEncrypted,
        whatsappConnectedAt: storesTable.whatsappConnectedAt,
      });
    if (!store) {
      res.status(404).json({ error: "Store not found." });
      return;
    }
    const profile = userProfileFromRequest(req);
    await writeAuditLog({
      storeId: store.id,
      action: "whatsapp.connection_saved",
      targetType: "whatsapp_connection",
      targetLabel: store.whatsappPhone ?? "WhatsApp connection",
      actorUserId,
      actorName: profile.name ?? profile.email ?? "Store administrator",
      details: { phoneNumberId: store.whatsappPhoneNumberId },
    });
    const status = connectionStatus(store);
    res.json(
      SaveWhatsAppConnectionResponse.parse(serializeDates({
        connected: status === "connected",
        phoneNumber: store.whatsappPhone,
        phoneNumberId: store.whatsappPhoneNumberId,
        wabaId: store.whatsappWabaId,
        status,
        webhookReady: webhookReady(),
        lastConnectedAt: store.whatsappConnectedAt,
      })),
    );
  },
);

router.get("/webhooks/whatsapp", (req, res): void => {
  if (!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.status(503).send("WhatsApp webhook verification is not configured.");
    return;
  }
  const parsed = VerifyWhatsAppWebhookQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).send("Invalid webhook verification request.");
    return;
  }
  const mode = parsed.data["hub.mode"];
  const verifyToken = parsed.data["hub.verify_token"];
  const challenge = parsed.data["hub.challenge"];
  if (mode !== "subscribe" || verifyToken !== process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.status(403).send("Webhook verification failed.");
    return;
  }
  res.type("text/plain").status(200).send(challenge);
});

router.post("/webhooks/whatsapp", async (req, res): Promise<void> => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    res.status(503).json({ error: "WhatsApp webhook verification is not configured." });
    return;
  }
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(JSON.stringify(req.body ?? {}));
   if (!signatureIsValid(rawBody, req.header("x-hub-signature-256"), appSecret)) {
    req.log.warn("Rejected WhatsApp webhook with invalid signature.");
    res.status(401).json({ error: "Invalid webhook signature." });
    return;
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid webhook payload." });
    return;
  }
  const parsed = ReceiveWhatsAppWebhookBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid webhook payload." });
    return;
  }
  const payload = parsed.data as MetaWebhookPayload;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId || !value?.messages?.length) continue;
      const [store] = await db
        .select({ id: storesTable.id })
        .from(storesTable)
        .where(eq(storesTable.whatsappPhoneNumberId, phoneNumberId))
        .limit(1);
      if (!store) {
        req.log.warn({ phoneNumberId }, "WhatsApp event did not match a tenant.");
        continue;
      }
      for (const message of value.messages) {
        await processMessage(store.id, message, phoneNumberId);
      }
    }
  }
  res.json(ReceiveWhatsAppWebhookResponse.parse({ received: true }));
});

router.use(authenticatedRouter);
export default router;
