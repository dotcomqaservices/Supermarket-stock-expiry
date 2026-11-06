import { db, systemSettingsTable } from "@workspace/db";

export async function getSystemConfiguration() {
  const [settings] = await db.select().from(systemSettingsTable).limit(1);
  return {
    signupEnabled: settings?.signupEnabled ?? true,
    serviceNotice: settings?.serviceNotice ?? "",
    supportEmail: settings?.supportEmail ?? "",
  };
}
