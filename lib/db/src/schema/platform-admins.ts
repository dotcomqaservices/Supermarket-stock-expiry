import { timestamp, varchar, pgTable } from "drizzle-orm/pg-core";

export const platformAdminsTable = pgTable("platform_admins", {
  clerkUserId: varchar("clerk_user_id", { length: 160 }).primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
