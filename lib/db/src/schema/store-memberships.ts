import { primaryKey, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { storesTable } from "./stores";

export const storeMembershipsTable = pgTable(
  "store_memberships",
  {
    storeId: uuid("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    clerkUserId: varchar("clerk_user_id", { length: 160 }).notNull(),
    role: varchar("role", { length: 32 }).notNull().default("store_admin"),
    email: varchar("email", { length: 320 }),
    displayName: varchar("display_name", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    primary: primaryKey({ columns: [table.storeId, table.clerkUserId] }),
  }),
);

export type StoreMembership = typeof storeMembershipsTable.$inferSelect;
