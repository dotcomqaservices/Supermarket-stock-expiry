import {
  date,
  index,
  numeric,
  pgTable,
  timestamp,
  uuid,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { storesTable } from "./stores";

export const productsTable = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    batchNumber: varchar("batch_number", { length: 120 }).notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 0 })
      .notNull()
      .default("0"),
    costPrice: numeric("cost_price", { precision: 12, scale: 2 }).notNull(),
    sellingPrice: numeric("selling_price", {
      precision: 12,
      scale: 2,
    }).notNull(),
    expiryDate: date("expiry_date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    storeBatchIdx: uniqueIndex("products_store_batch_unique").on(
      table.storeId,
      table.batchNumber,
    ),
    storeExpiryIdx: index("products_store_expiry_idx").on(
      table.storeId,
      table.expiryDate,
    ),
  }),
);

export type Product = typeof productsTable.$inferSelect;
export type NewProduct = typeof productsTable.$inferInsert;
