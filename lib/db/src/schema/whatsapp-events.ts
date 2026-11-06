import { pgTable, timestamp, uuid, varchar, uniqueIndex } from "drizzle-orm/pg-core";
import { storesTable } from "./stores";

export const whatsappEventsTable = pgTable(
  "whatsapp_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    messageId: varchar("message_id", { length: 180 }).notNull(),
    senderPhone: varchar("sender_phone", { length: 40 }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    messageIdUnique: uniqueIndex("whatsapp_events_message_id_unique").on(
      table.messageId,
    ),
  }),
);
