import {
  date,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const storesTable = pgTable("stores", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  branchLabel: varchar("branch_label", { length: 120 }).notNull(),
  address: text("address").notNull(),
  contactName: varchar("contact_name", { length: 160 }).notNull(),
  contactPhone: varchar("contact_phone", { length: 40 }).notNull(),
  contactEmail: varchar("contact_email", { length: 320 }).notNull(),
  whatsappPhone: varchar("whatsapp_phone", { length: 40 }).notNull(),
  subscriptionPlan: varchar("subscription_plan", { length: 80 })
    .notNull()
    .default("Starter Plan"),
  subscriptionStatus: varchar("subscription_status", { length: 40 })
    .notNull()
    .default("active"),
  whatsappPhoneNumberId: varchar("whatsapp_phone_number_id", { length: 120 }).unique(),
  whatsappWabaId: varchar("whatsapp_waba_id", { length: 120 }),
  whatsappAccessTokenEncrypted: text("whatsapp_access_token_encrypted"),
  whatsappAccessTokenIv: varchar("whatsapp_access_token_iv", { length: 64 }),
  whatsappAccessTokenTag: varchar("whatsapp_access_token_tag", { length: 64 }),
  whatsappConnectedAt: timestamp("whatsapp_connected_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Store = typeof storesTable.$inferSelect;
export type NewStore = typeof storesTable.$inferInsert;
