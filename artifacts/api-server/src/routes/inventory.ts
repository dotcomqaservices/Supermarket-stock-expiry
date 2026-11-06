import { and, eq, asc } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, productsTable } from "@workspace/db";
import {
  CreateProductBody,
  CreateProductParams,
  CreateProductResponse,
  DeleteProductParams,
  GetProductParams,
  GetProductResponse,
  ListProductsParams,
  ListProductsResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
} from "@workspace/api-zod";
import { getExpiryStatus } from "../lib/expiry";
import { writeAuditLog } from "../lib/audit";
import { serializeDates } from "../lib/serialize";
import {
  authorizeStoreAdmin,
  requireAuth,
  userProfileFromRequest,
} from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireAuth);

function toProduct(product: typeof productsTable.$inferSelect) {
  return {
    ...product,
    quantity: Number(product.quantity),
    costPrice: Number(product.costPrice),
    sellingPrice: Number(product.sellingPrice),
    expiryStatus: getExpiryStatus(product.expiryDate),
  };
}

function getActorName(req: Parameters<typeof userProfileFromRequest>[0]): string {
  const profile = userProfileFromRequest(req);
  return profile.name ?? profile.email ?? "Store administrator";
}

function toCalendarDate(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value.slice(0, 10);
}

router.get(
  "/stores/:storeId/products",
  async (req, res): Promise<void> => {
    const params = ListProductsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!(await authorizeStoreAdmin(req, res, params.data.storeId))) return;

    const products = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.storeId, params.data.storeId))
      .orderBy(asc(productsTable.expiryDate), asc(productsTable.name))
      .limit(100);

    res.json(
      ListProductsResponse.parse(serializeDates(products.map(toProduct))),
    );
  },
);

router.post(
  "/stores/:storeId/products",
  async (req, res): Promise<void> => {
    const params = CreateProductParams.safeParse(req.params);
    const parsed = CreateProductBody.safeParse(req.body);
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

    const [product] = await db
      .insert(productsTable)
      .values({
        ...parsed.data,
        storeId: params.data.storeId,
        quantity: String(parsed.data.quantity),
        costPrice: String(parsed.data.costPrice),
        sellingPrice: String(parsed.data.sellingPrice),
        expiryDate: toCalendarDate(parsed.data.expiryDate),
      })
      .returning();
    if (!product) {
      res.status(500).json({ error: "Product could not be created." });
      return;
    }
    await writeAuditLog({
      storeId: params.data.storeId,
      action: "inventory.created",
      targetType: "product",
      targetId: product.id,
      targetLabel: product.name,
      actorUserId,
      actorName: getActorName(req),
      details: { batchNumber: product.batchNumber, quantity: product.quantity },
    });
    res
      .status(201)
      .json(
        CreateProductResponse.parse(serializeDates(toProduct(product))),
      );
  },
);

router.get(
  "/stores/:storeId/products/:productId",
  async (req, res): Promise<void> => {
    const params = GetProductParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!(await authorizeStoreAdmin(req, res, params.data.storeId))) return;

    const [product] = await db
      .select()
      .from(productsTable)
      .where(
        and(
          eq(productsTable.id, params.data.productId),
          eq(productsTable.storeId, params.data.storeId),
        ),
      )
      .limit(1);
    if (!product) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    res.json(GetProductResponse.parse(serializeDates(toProduct(product))));
  },
);

router.patch(
  "/stores/:storeId/products/:productId",
  async (req, res): Promise<void> => {
    const params = UpdateProductParams.safeParse(req.params);
    const parsed = UpdateProductBody.safeParse(req.body);
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

    const [before] = await db
      .select()
      .from(productsTable)
      .where(
        and(
          eq(productsTable.id, params.data.productId),
          eq(productsTable.storeId, params.data.storeId),
        ),
      )
      .limit(1);
    if (!before) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    const {
      quantity,
      costPrice,
      sellingPrice,
      expiryDate,
      ...productFields
    } = parsed.data;
    const updateData: Partial<typeof productsTable.$inferInsert> = {
      ...productFields,
      ...(quantity === undefined ? {} : { quantity: String(quantity) }),
      ...(costPrice === undefined ? {} : { costPrice: String(costPrice) }),
      ...(sellingPrice === undefined
        ? {}
        : { sellingPrice: String(sellingPrice) }),
      ...(expiryDate === undefined
        ? {}
        : { expiryDate: toCalendarDate(expiryDate) }),
    };
    const [product] = await db
      .update(productsTable)
      .set(updateData)
      .where(
        and(
          eq(productsTable.id, params.data.productId),
          eq(productsTable.storeId, params.data.storeId),
        ),
      )
      .returning();
    if (!product) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    await writeAuditLog({
      storeId: params.data.storeId,
      action: "inventory.updated",
      targetType: "product",
      targetId: product.id,
      targetLabel: product.name,
      actorUserId,
      actorName: getActorName(req),
      details: {
        previousQuantity: before.quantity,
        newQuantity: product.quantity,
        changedFields: Object.keys(parsed.data),
      },
    });
    res.json(UpdateProductResponse.parse(serializeDates(toProduct(product))));
  },
);

router.delete(
  "/stores/:storeId/products/:productId",
  async (req, res): Promise<void> => {
    const params = DeleteProductParams.safeParse(req.params);
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

    const [product] = await db
      .delete(productsTable)
      .where(
        and(
          eq(productsTable.id, params.data.productId),
          eq(productsTable.storeId, params.data.storeId),
        ),
      )
      .returning();
    if (!product) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    await writeAuditLog({
      storeId: params.data.storeId,
      action: "inventory.deleted",
      targetType: "product",
      targetId: product.id,
      targetLabel: product.name,
      actorUserId,
      actorName: getActorName(req),
      details: { batchNumber: product.batchNumber },
    });
    res.sendStatus(204);
  },
);

export default router;
