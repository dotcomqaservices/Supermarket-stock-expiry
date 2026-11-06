import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { storesTable } from "./stores";

export const securityAlertsTable = pgTable("security_alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => storesTable.id, { onDelete: "cascade" }),
  senderPhone: varchar("sender_phone", { length: 40 }).notNull(),
  reason: varchar("reason", { length: 100 }).notNull(),
  messagePreview: varchar("message_preview", { length: 300 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
