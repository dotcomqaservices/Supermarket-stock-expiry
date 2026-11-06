import {
  boolean,
  pgTable,
  timestamp,
  uuid,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { storesTable } from "./stores";

export const staffMembersTable = pgTable(
  "staff_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    phoneNumber: varchar("phone_number", { length: 40 }).notNull(),
    contactDetails: varchar("contact_details", { length: 500 }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    storePhoneIdx: uniqueIndex("staff_store_phone_unique").on(
      table.storeId,
      table.phoneNumber,
    ),
  }),
);

export type StaffMember = typeof staffMembersTable.$inferSelect;
