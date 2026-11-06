import { boolean, integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Platform-owned singleton, not tenant-owned data.
export const systemSettingsTable = pgTable("system_settings", {
  id: integer("id").primaryKey().default(1),
  signupEnabled: boolean("signup_enabled").notNull().default(true),
  serviceNotice: varchar("service_notice", { length: 280 }).notNull().default(""),
  supportEmail: varchar("support_email", { length: 320 }).notNull().default(""),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
