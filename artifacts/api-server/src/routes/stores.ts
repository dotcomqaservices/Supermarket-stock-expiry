import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  auditLogsTable,
  platformAdminsTable,
  productsTable,
  storeMembershipsTable,
  storesTable,
} from "@workspace/db";
import {
  CreateStoreBody,
  CreateStoreResponse,
  GetDashboardParams,
  GetDashboardResponse,
  GetMeResponse,
  GetStoreParams,
  GetStoreResponse,
  ListStoresResponse,
  UpdateStoreBody,
  UpdateStoreParams,
  UpdateStoreResponse,
} from "@workspace/api-zod";
import { writeAuditLog } from "../lib/audit";
import { daysUntilExpiry, getExpiryStatus } from "../lib/expiry";
import { serializeDates } from "../lib/serialize";
import { getSystemConfiguration } from "../lib/system-settings";
import {
  authorizeStoreAdmin,
  isPlatformAdmin,
  requireAuth,
  userIdFromRequest,
  userProfileFromRequest,
} from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/me", async (req, res): Promise<void> => {
  const userId = userIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const profile = userProfileFromRequest(req);
  const memberships = await db
    .select({
      store: storesTable,
      role: storeMembershipsTable.role,
    })
    .from(storeMembershipsTable)
    .innerJoin(storesTable, eq(storeMembershipsTable.storeId, storesTable.id))
    .where(eq(storeMembershipsTable.clerkUserId, userId))
    .orderBy(desc(storesTable.createdAt));

  res.json(
    GetMeResponse.parse(serializeDates({
      userId,
      email: profile.email,
      name: profile.name,
      platformRole: (await isPlatformAdmin(userId, profile.email))
        ? "super_admin"
        : "user",
      memberships,
    })),
  );
});

router.get("/stores", async (req, res): Promise<void> => {
  const userId = userIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const memberships = await db
    .select({
      store: storesTable,
      role: storeMembershipsTable.role,
    })
    .from(storeMembershipsTable)
    .innerJoin(storesTable, eq(storeMembershipsTable.storeId, storesTable.id))
    .where(eq(storeMembershipsTable.clerkUserId, userId))
    .orderBy(desc(storesTable.createdAt));

  res.json(ListStoresResponse.parse(serializeDates(memberships)));
});

router.post("/stores", async (req, res): Promise<void> => {
  if (!(await getSystemConfiguration()).signupEnabled) {
    res.status(403).json({ error: "New store registration is temporarily paused." });
    return;
  }
  const parsed = CreateStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = userIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const profile = userProfileFromRequest(req);

  const membership = await db.transaction(async (tx) => {
    const [store] = await tx
      .insert(storesTable)
      .values({
        ...parsed.data,
        subscriptionPlan: "Starter Plan",
        subscriptionStatus: "active",
      })
      .returning();
    if (!store) throw new Error("Store could not be created.");

    await tx.insert(storeMembershipsTable).values({
      storeId: store.id,
      clerkUserId: userId,
      role: "store_admin",
      email: profile.email,
      displayName: profile.name,
    });

    await tx.insert(auditLogsTable).values({
      storeId: store.id,
      action: "store.created",
      targetType: "store",
      targetId: store.id,
      targetLabel: store.name,
      actorUserId: userId,
      actorName: profile.name ?? profile.email ?? "Store administrator",
      details: { plan: "Starter Plan" },
    });

    return { store, role: "store_admin" as const };
  });

  res
    .status(201)
    .json(CreateStoreResponse.parse(serializeDates(membership)));
});

router.get("/stores/:storeId", async (req, res): Promise<void> => {
  const params = GetStoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await authorizeStoreAdmin(req, res, params.data.storeId))) return;

  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, params.data.storeId))
    .limit(1);
  if (!store) {
    res.status(404).json({ error: "Store not found." });
    return;
  }
  res.json(GetStoreResponse.parse(serializeDates(store)));
});

router.patch("/stores/:storeId", async (req, res): Promise<void> => {
  const params = UpdateStoreParams.safeParse(req.params);
  const parsed = UpdateStoreBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const actorUserId = await authorizeStoreAdmin(req, res, params.data.storeId);
  if (!actorUserId) return;

  const [before] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, params.data.storeId))
    .limit(1);
  if (!before) {
    res.status(404).json({ error: "Store not found." });
    return;
  }
  const [store] = await db
    .update(storesTable)
    .set(parsed.data)
    .where(eq(storesTable.id, params.data.storeId))
    .returning();
  if (!store) {
    res.status(404).json({ error: "Store not found." });
    return;
  }
  const actor = userProfileFromRequest(req);
  await writeAuditLog({
    storeId: store.id,
    action: "store.updated",
    targetType: "store",
    targetId: store.id,
    targetLabel: store.name,
    actorUserId,
    actorName: actor.name ?? actor.email ?? "Store administrator",
    details: { changedFields: Object.keys(parsed.data) },
  });
  res.json(UpdateStoreResponse.parse(serializeDates(store)));
});

router.get("/stores/:storeId/dashboard", async (req, res): Promise<void> => {
  const params = GetDashboardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await authorizeStoreAdmin(req, res, params.data.storeId))) return;

  const products = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.storeId, params.data.storeId));
  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.storeId, params.data.storeId))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(8);

  const expiryCounts = {
    expired: 0,
    expiringSoon: 0,
    safe: 0,
    day1to3: 0,
    day4to7: 0,
    day8plus: 0,
  };
  let totalUnits = 0;
  let estimatedInventoryValue = 0;
  let lowStockCount = 0;

  for (const product of products) {
    const quantity = Number(product.quantity);
    const costPrice = Number(product.costPrice);
    const days = daysUntilExpiry(product.expiryDate);
    const status = getExpiryStatus(product.expiryDate);
    totalUnits += quantity;
    estimatedInventoryValue += quantity * costPrice;
    if (quantity <= 10) lowStockCount += 1;
    if (status === "expired") {
      expiryCounts.expired += 1;
    } else if (status === "expiring_soon") {
      expiryCounts.expiringSoon += 1;
      if (days <= 3) expiryCounts.day1to3 += 1;
      else expiryCounts.day4to7 += 1;
    } else {
      expiryCounts.safe += 1;
      expiryCounts.day8plus += 1;
    }
  }

  res.json(
    GetDashboardResponse.parse(serializeDates({
      totalProducts: products.length,
      totalUnits,
      expiringSoonCount: expiryCounts.expiringSoon,
      expiredCount: expiryCounts.expired,
      safeCount: expiryCounts.safe,
      lowStockCount,
      estimatedInventoryValue,
      recentActivity: logs,
      expiryBreakdown: [
        { label: "Expired", count: expiryCounts.expired },
        { label: "1–3 days", count: expiryCounts.day1to3 },
        { label: "4–7 days", count: expiryCounts.day4to7 },
        { label: "8+ days", count: expiryCounts.day8plus },
      ],
    })),
  );
});

export default router;
