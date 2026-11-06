import { count, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  platformAdminsTable,
  productsTable,
  staffMembersTable,
  storeMembershipsTable,
  storesTable,
  auditLogsTable,
} from "@workspace/db";
import {
  GetPlatformOverviewResponse,
  ListAllStoresResponse,
  ListPlatformUsersResponse,
  UpdateStorePlanBody,
  UpdateStorePlanParams,
  UpdateStorePlanResponse,
  UpdatePlatformUserRoleBody,
  UpdatePlatformUserRoleParams,
  UpdatePlatformUserRoleResponse,
} from "@workspace/api-zod";
import { getExpiryStatus } from "../lib/expiry";
import {
  authorizePlatformAdmin,
  isPlatformAdmin,
  userProfileFromRequest,
} from "../middlewares/auth";
import { serializeDates } from "../lib/serialize";

const router: IRouter = Router();

router.get("/admin/overview", async (req, res): Promise<void> => {
  if (!(await authorizePlatformAdmin(req, res))) return;
  const [totalStores] = await db.select({ value: count() }).from(storesTable);
  const [activeStores] = await db
    .select({ value: count() })
    .from(storesTable)
    .where(eq(storesTable.subscriptionStatus, "active"));
  const [totalProducts] = await db
    .select({ value: count() })
    .from(productsTable);
  const products = await db
    .select({ expiryDate: productsTable.expiryDate })
    .from(productsTable);
  const stores = await db
    .select({ subscriptionPlan: storesTable.subscriptionPlan })
    .from(storesTable);

  const planCounts = new Map<string, number>();
  for (const store of stores) {
    planCounts.set(
      store.subscriptionPlan,
      (planCounts.get(store.subscriptionPlan) ?? 0) + 1,
    );
  }
  const overview = {
    totalStores: Number(totalStores?.value ?? 0),
    activeStores: Number(activeStores?.value ?? 0),
    totalProducts: Number(totalProducts?.value ?? 0),
    expiringSoonCount: products.filter(
      (product) => getExpiryStatus(product.expiryDate) === "expiring_soon",
    ).length,
    expiredCount: products.filter(
      (product) => getExpiryStatus(product.expiryDate) === "expired",
    ).length,
    planBreakdown: [...planCounts].map(([plan, storeCount]) => ({
      plan,
      storeCount,
    })),
  };
  res.json(GetPlatformOverviewResponse.parse(overview));
});

router.get("/admin/stores", async (req, res): Promise<void> => {
  if (!(await authorizePlatformAdmin(req, res))) return;
  const stores = await db
    .select()
    .from(storesTable)
    .orderBy(desc(storesTable.createdAt));
  const rows = await Promise.all(
    stores.map(async (store) => {
      const [productCount] = await db
        .select({ value: count() })
        .from(productsTable)
        .where(eq(productsTable.storeId, store.id));
      const [staffCount] = await db
        .select({ value: count() })
        .from(staffMembersTable)
        .where(eq(staffMembersTable.storeId, store.id));
      return {
        ...store,
        productCount: Number(productCount?.value ?? 0),
        staffCount: Number(staffCount?.value ?? 0),
      };
    }),
  );
  res.json(ListAllStoresResponse.parse(serializeDates(rows)));
});

router.get("/admin/users", async (req, res): Promise<void> => {
  if (!(await authorizePlatformAdmin(req, res))) return;
  const [memberships, storedAdmins] = await Promise.all([
    db
      .select({
        userId: storeMembershipsTable.clerkUserId,
        email: storeMembershipsTable.email,
        name: storeMembershipsTable.displayName,
        storeId: storesTable.id,
        storeName: storesTable.name,
        role: storeMembershipsTable.role,
      })
      .from(storeMembershipsTable)
      .innerJoin(storesTable, eq(storeMembershipsTable.storeId, storesTable.id)),
    db.select().from(platformAdminsTable),
  ]);

  const adminById = new Map(
    storedAdmins.map((admin) => [admin.clerkUserId, admin.email]),
  );
  const configuredIds = new Set(
    (process.env.SUPER_ADMIN_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const configuredEmails = new Set(
    (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  const users = new Map<
    string,
    {
      userId: string;
      email: string | null;
      name: string | null;
      platformRole: "user" | "super_admin";
      storeMemberships: Array<{
        storeId: string;
        storeName: string;
        role: string;
      }>;
    }
  >();

  for (const membership of memberships) {
    const adminEmail = adminById.get(membership.userId);
    const email = membership.email ?? adminEmail ?? null;
    const existing = users.get(membership.userId) ?? {
      userId: membership.userId,
      email,
      name: membership.name ?? null,
      platformRole:
        configuredIds.has(membership.userId) ||
        Boolean(email && configuredEmails.has(email.toLowerCase())) ||
        Boolean(adminEmail)
          ? ("super_admin" as const)
          : ("user" as const),
      storeMemberships: [],
    };
    existing.storeMemberships.push({
      storeId: membership.storeId,
      storeName: membership.storeName,
      role: membership.role,
    });
    users.set(membership.userId, existing);
  }

  for (const admin of storedAdmins) {
    if (!users.has(admin.clerkUserId)) {
      users.set(admin.clerkUserId, {
        userId: admin.clerkUserId,
        email: admin.email,
        name: null,
        platformRole: "super_admin",
        storeMemberships: [],
      });
    }
  }
  res.json(ListPlatformUsersResponse.parse([...users.values()]));
});

router.patch(
  "/admin/users/:userId",
  async (req, res): Promise<void> => {
    const params = UpdatePlatformUserRoleParams.safeParse(req.params);
    const parsed = UpdatePlatformUserRoleBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actorUserId = await authorizePlatformAdmin(req, res);
    if (!actorUserId) return;
    if (
      actorUserId === params.data.userId &&
      parsed.data.platformRole === "user"
    ) {
      res.status(400).json({
        error: "Ask another super admin to change your platform role.",
      });
      return;
    }
    const [membership] = await db
      .select({
        email: storeMembershipsTable.email,
        name: storeMembershipsTable.displayName,
      })
      .from(storeMembershipsTable)
      .where(eq(storeMembershipsTable.clerkUserId, params.data.userId))
      .limit(1);
    const [storedAdmin] = await db
      .select()
      .from(platformAdminsTable)
      .where(eq(platformAdminsTable.clerkUserId, params.data.userId))
      .limit(1);
    const email = membership?.email ?? storedAdmin?.email;
    if (!membership && !storedAdmin) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    const configuredIds = (process.env.SUPER_ADMIN_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const configuredEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (
      parsed.data.platformRole === "user" &&
      (configuredIds.includes(params.data.userId) ||
        (email && configuredEmails.includes(email.toLowerCase())))
    ) {
      res.status(400).json({
        error: "This super admin is managed through the project configuration.",
      });
      return;
    }
    if (parsed.data.platformRole === "super_admin" && !email) {
      res.status(400).json({
        error: "A verified email is required before granting super admin access.",
      });
      return;
    }

    await db.transaction(async (tx) => {
      if (parsed.data.platformRole === "super_admin" && email) {
        await tx
          .insert(platformAdminsTable)
          .values({ clerkUserId: params.data.userId, email })
          .onConflictDoUpdate({
            target: platformAdminsTable.clerkUserId,
            set: { email },
          });
      } else {
        await tx
          .delete(platformAdminsTable)
          .where(eq(platformAdminsTable.clerkUserId, params.data.userId));
      }

      const targetMemberships = await tx
        .select({ storeId: storeMembershipsTable.storeId })
        .from(storeMembershipsTable)
        .where(eq(storeMembershipsTable.clerkUserId, params.data.userId));
      const actor = userProfileFromRequest(req);
      const [actorAdminMembership] = await tx
        .select({ displayName: storeMembershipsTable.displayName })
        .from(storeMembershipsTable)
        .where(eq(storeMembershipsTable.clerkUserId, actorUserId))
        .limit(1);
      if (targetMemberships.length > 0) {
        await tx.insert(auditLogsTable).values(
          targetMemberships.map(({ storeId }) => ({
            storeId,
            action: "platform.user_role_updated",
            targetType: "user",
            targetId: params.data.userId,
            targetLabel: email ?? params.data.userId,
            actorUserId,
            actorName:
              actor.name ??
              actor.email ??
              actorAdminMembership?.displayName ??
              "Super administrator",
            details: { platformRole: parsed.data.platformRole },
          })),
        );
      }
    });

    const freshMemberships = await db
      .select({
        storeId: storeMembershipsTable.storeId,
        storeName: storesTable.name,
        role: storeMembershipsTable.role,
      })
      .from(storeMembershipsTable)
      .innerJoin(storesTable, eq(storeMembershipsTable.storeId, storesTable.id))
      .where(eq(storeMembershipsTable.clerkUserId, params.data.userId));
    const user = {
      userId: params.data.userId,
      email: email ?? null,
      name: membership?.name ?? null,
      platformRole: parsed.data.platformRole,
      storeMemberships: freshMemberships,
    };
    const platformUser = UpdatePlatformUserRoleResponse.parse(user);
    res.json(platformUser);
  },
);

router.patch(
  "/admin/stores/:storeId/plan",
  async (req, res): Promise<void> => {
    const params = UpdateStorePlanParams.safeParse(req.params);
    const parsed = UpdateStorePlanBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actorUserId = await authorizePlatformAdmin(req, res);
    if (!actorUserId) return;
    const [store] = await db
      .update(storesTable)
      .set({ subscriptionPlan: parsed.data.subscriptionPlan })
      .where(eq(storesTable.id, params.data.storeId))
      .returning();
    if (!store) {
      res.status(404).json({ error: "Store not found." });
      return;
    }

    const [productCount] = await db
      .select({ value: count() })
      .from(productsTable)
      .where(eq(productsTable.storeId, store.id));
    const [staffCount] = await db
      .select({ value: count() })
      .from(staffMembersTable)
      .where(eq(staffMembersTable.storeId, store.id));
    const profile = userProfileFromRequest(req);
    await db.insert(auditLogsTable).values({
      storeId: store.id,
      action: "subscription.plan_updated",
      targetType: "subscription",
      targetId: store.id,
      targetLabel: store.name,
      actorUserId,
      actorName: profile.name ?? profile.email ?? "Super administrator",
      details: { subscriptionPlan: parsed.data.subscriptionPlan },
    });
    res.json(
      UpdateStorePlanResponse.parse(serializeDates({
        ...store,
        productCount: Number(productCount?.value ?? 0),
        staffCount: Number(staffCount?.value ?? 0),
      })),
    );
  },
);

export default router;
