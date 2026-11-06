import { Router, type IRouter } from "express";
import { db, systemSettingsTable } from "@workspace/db";
import { UpdateSystemSettingsBody } from "@workspace/api-zod";
import { authorizePlatformAdmin } from "../middlewares/auth";
import { getSystemConfiguration } from "../lib/system-settings";

const router: IRouter = Router();

router.get("/configuration", async (_req, res) => {
  res.json(await getSystemConfiguration());
});

router.get("/admin/settings", async (req, res) => {
  if (!(await authorizePlatformAdmin(req, res))) return;
  res.json(await getSystemConfiguration());
});

router.put("/admin/settings", async (req, res) => {
  const userId = await authorizePlatformAdmin(req, res);
  if (!userId) return;
  const parsed = UpdateSystemSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid system settings." });
    return;
  }
  const data = {
    ...parsed.data,
    serviceNotice: parsed.data.serviceNotice.trim(),
    supportEmail: parsed.data.supportEmail.trim(),
  };
  if (data.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.supportEmail)) {
    res.status(400).json({ error: "Enter a valid support email or leave it blank." });
    return;
  }
  await db.insert(systemSettingsTable).values({
    id: 1, ...data, updatedBy: userId, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: systemSettingsTable.id,
    set: { ...data, updatedBy: userId, updatedAt: new Date() },
  });
  res.json(data);
});

export default router;
