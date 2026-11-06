import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_STOCK_QUANTITY = 999_999_999_999;
export const normalizePhone = (value: string): string => value.replace(/\D/g, "");

export function parseStockCommand(body: string) {
  const match = body.trim().match(/^(SET|STOCK|ADD)\s+([A-Z0-9/_-]+)\s+(\d+)$/i);
  if (!match) return null;
  const quantity = Number(match[3]);
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_STOCK_QUANTITY) return null;
  return {
    operation: match[1].toUpperCase() === "ADD" ? "add" as const : "set" as const,
    batchNumber: match[2],
    quantity,
  };
}

export function signatureIsValid(rawBody: Buffer, signature: string | undefined, secret: string | undefined): boolean {
  if (!secret || !signature || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return false;
  const received = Buffer.from(signature.slice(7), "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return timingSafeEqual(received, expected);
}

export class MetaConnectionError extends Error {}

/** Confirm the selected number belongs to the WABA, then subscribe the token's app. */
export async function verifyBusinessConnection(
  input: { phoneNumber: string; phoneNumberId: string; wabaId: string; accessToken: string },
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!/^\d+$/.test(input.phoneNumberId) || !/^\d+$/.test(input.wabaId)) {
    throw new MetaConnectionError("Meta phone number and business account IDs must contain only digits.");
  }
  const version = process.env.WHATSAPP_GRAPH_API_VERSION ?? "v27.0";
  if (!/^v\d+\.\d+$/.test(version)) throw new MetaConnectionError("The service's Meta API version is invalid.");
  const request = async (path: string, method = "GET"): Promise<Record<string, unknown>> => {
    let response: Response;
    try {
      response = await fetcher(`https://graph.facebook.com/${version}/${path}`, {
        method,
        headers: { Authorization: `Bearer ${input.accessToken}` },
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new MetaConnectionError("Meta could not be reached. Please try again.");
    }
    if (!response.ok) {
      throw new MetaConnectionError(
        response.status === 401 || response.status === 403
          ? "Meta rejected this token or its permissions. Check WhatsApp Business Management access."
          : "Meta could not verify this connection. Check the account IDs, token permissions, and app configuration.",
      );
    }
    try {
      return await response.json() as Record<string, unknown>;
    } catch {
      throw new MetaConnectionError("Meta returned an invalid response. Please try again.");
    }
  };
  const account = await request(`${input.wabaId}/phone_numbers?fields=id,display_phone_number&limit=100`);
  const numbers = Array.isArray(account.data) ? account.data as Array<Record<string, unknown>> : [];
  const selected = numbers.find(number => number.id === input.phoneNumberId);
  if (!selected || typeof selected.display_phone_number !== "string") {
    throw new MetaConnectionError("The phone number ID does not belong to this WhatsApp Business account.");
  }
  if (normalizePhone(selected.display_phone_number) !== normalizePhone(input.phoneNumber)) {
    throw new MetaConnectionError("The official phone number does not match the number registered with Meta.");
  }
  const subscription = await request(`${input.wabaId}/subscribed_apps`, "POST");
  if (subscription.success !== true) {
    throw new MetaConnectionError("Meta did not confirm the webhook subscription.");
  }
}
