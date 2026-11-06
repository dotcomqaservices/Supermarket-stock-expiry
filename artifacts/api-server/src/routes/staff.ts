import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  auditLogsTable,
  db,
  securityAlertsTable,
  staffMembersTable,
} from "@workspace/db";
import {
  CreateStaffBody,
  CreateStaffParams,
  CreateStaffResponse,
  DeleteStaffParams,
  ListAuditLogsParams,
  ListAuditLogsResponse,
  ListSecurityAlertsParams,
  ListSecurityAlertsResponse,
  ListStaffParams,
  ListStaffResponse,
  UpdateStaffBody,
  UpdateStaffParams,
  UpdateStaffResponse,
} from "@workspace/api-zod";
import { serializeDates } from "../lib/serialize";
import {
  authorizeStoreAdmin,
  requireAuth,
  userProfileFromRequest,
} from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireAuth);

function actorName(req: Parameters<typeof userProfileFromRequest>[0]): string {
  const profile = userProfileFromRequest(req);
  return profile.name ?? profile.email ?? "Store administrator";
}

function normalizePhone(phone: string): string {
  return `+${phone.replace(/\D/g, "")}`;
}

router.get(
  "/stores/:storeId/staff",
  async (req, res): Promise<void> => {
    const params = ListStaffParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!(await authorizeStoreAdmin(req, res, params.data.storeId))) return;

    const staff = await db
      .select()
      .from(staffMembersTable)
      .where(eq(staffMembersTable.storeId, params.data.storeId))
      .orderBy(desc(staffMembersTable.createdAt));
    res.json(ListStaffResponse.parse(serializeDates(staff)));
  },
);

router.post(
  "/stores/:storeId/staff",
  async (req, res): Promise<void> => {
    const params = CreateStaffParams.safeParse(req.params);
    const parsed = CreateStaffBody.safeParse(req.body);
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

    const phoneNumber = normalizePhone(parsed.data.phoneNumber);
    if (phoneNumber.length < 6) {
      res.status(400).json({
        error: "Enter the phone number with its country code.",
      });
      return;
    }
    const [existing] = await db
      .select({ id: staffMembersTable.id })
      .from(staffMembersTable)
      .where(
        and(
          eq(staffMembersTable.storeId, params.data.storeId),
          eq(staffMembersTable.phoneNumber, phoneNumber),
        ),
      )
      .limit(1);
    if (existing) {
      res.status(400).json({ error: "This phone number is already registered." });
      return;
    }

    const staff = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(staffMembersTable)
        .values({
          ...parsed.data,
          phoneNumber,
          storeId: params.data.storeId,
        })
        .returning();
      if (!created) return null;
      await tx.insert(auditLogsTable).values({
        storeId: params.data.storeId,
        action: "staff.added",
        targetType: "staff",
        targetId: created.id,
        targetLabel: created.name,
        actorUserId,
        actorName: actorName(req),
        details: { phoneNumber: created.phoneNumber, active: created.active },
      });
      return created;
    });
    if (!staff) {
      res.status(500).json({ error: "Staff member could not be created." });
      return;
    }
    res.status(201).json(CreateStaffResponse.parse(serializeDates(staff)));
  },
);

router.patch(
  "/stores/:storeId/staff/:staffId",
  async (req, res): Promise<void> => {
    const params = UpdateStaffParams.safeParse(req.params);
    const parsed = UpdateStaffBody.safeParse(req.body);
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

    const update = {
      ...parsed.data,
      ...(parsed.data.phoneNumber
        ? { phoneNumber: normalizePhone(parsed.data.phoneNumber) }
        : {}),
    };
    if (update.phoneNumber && update.phoneNumber.length < 6) {
      res.status(400).json({
        error: "Enter the phone number with its country code.",
      });
      return;
    }
    const staff = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(staffMembersTable)
        .where(
          and(
            eq(staffMembersTable.id, params.data.staffId),
            eq(staffMembersTable.storeId, params.data.storeId),
          ),
        )
        .limit(1);
      if (!before) return null;
      const [updated] = await tx
        .update(staffMembersTable)
        .set(update)
        .where(
          and(
            eq(staffMembersTable.id, params.data.staffId),
            eq(staffMembersTable.storeId, params.data.storeId),
          ),
        )
        .returning();
      if (!updated) return null;
      const action =
        parsed.data.active === false && before.active
          ? "staff.deactivated"
          : parsed.data.active === true && !before.active
            ? "staff.activated"
            : "staff.updated";
      await tx.insert(auditLogsTable).values({
        storeId: params.data.storeId,
        action,
        targetType: "staff",
        targetId: updated.id,
        targetLabel: updated.name,
        actorUserId,
        actorName: actorName(req),
        details: {
          before: {
            name: before.name,
            phoneNumber: before.phoneNumber,
            contactDetails: before.contactDetails,
            active: before.active,
          },
          after: {
            name: updated.name,
            phoneNumber: updated.phoneNumber,
            contactDetails: updated.contactDetails,
            active: updated.active,
          },
        },
      });
      return updated;
    });
    if (!staff) {
      res.status(404).json({ error: "Staff member not found." });
      return;
    }
    res.json(UpdateStaffResponse.parse(serializeDates(staff)));
  },
);

router.delete(
  "/stores/:storeId/staff/:staffId",
  async (req, res): Promise<void> => {
    const params = DeleteStaffParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const actorUserId = await authorizeStoreAdmin(
      req,
      res,
      params.data.storeId,
    );
    if (!actorUserId) return;

    const [staff] = await db
      .select()
      .from(staffMembersTable)
      .where(
        and(
          eq(staffMembersTable.id, params.data.staffId),
          eq(staffMembersTable.storeId, params.data.storeId),
        ),
      )
      .limit(1);
    if (!staff) {
      res.status(404).json({ error: "Staff member not found." });
      return;
    }
    await db.transaction(async (tx) => {
      await tx.insert(auditLogsTable).values({
        storeId: params.data.storeId,
        action: "staff.removed",
        targetType: "staff",
        targetId: staff.id,
        targetLabel: staff.name,
        actorUserId,
        actorName: actorName(req),
        details: {
          phoneNumber: staff.phoneNumber,
          contactDetails: staff.contactDetails,
          active: staff.active,
        },
      });
      await tx
        .delete(staffMembersTable)
        .where(
          and(
            eq(staffMembersTable.id, staff.id),
            eq(staffMembersTable.storeId, params.data.storeId),
          ),
        );
    });
    res.sendStatus(204);
  },
);

router.get(
  "/stores/:storeId/audit-logs",
  async (req, res): Promise<void> => {
    const params = ListAuditLogsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!(await authorizeStoreAdmin(req, res, params.data.storeId))) return;
    const logs = await db
      .select()
      .from(auditLogsTable)
      .where(eq(auditLogsTable.storeId, params.data.storeId))
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(100);
    res.json(ListAuditLogsResponse.parse(serializeDates(logs)));
  },
);

router.get(
  "/stores/:storeId/security-alerts",
  async (req, res): Promise<void> => {
    const params = ListSecurityAlertsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!(await authorizeStoreAdmin(req, res, params.data.storeId))) return;
    const alerts = await db
      .select()
      .from(securityAlertsTable)
      .where(eq(securityAlertsTable.storeId, params.data.storeId))
      .orderBy(desc(securityAlertsTable.createdAt))
      .limit(100);
    res.json(ListSecurityAlertsResponse.parse(serializeDates(alerts)));
  },
);

export default router;
