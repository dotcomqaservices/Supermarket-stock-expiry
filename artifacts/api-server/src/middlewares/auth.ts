import { clerkClient, getAuth } from "@clerk/express";
import type { Request, RequestHandler, Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, platformAdminsTable, storeMembershipsTable } from "@workspace/db";

export interface AuthenticatedRequest extends Request {
  appUserId?: string;
  appUserProfile?: { email: string | null; name: string | null };
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  (req as AuthenticatedRequest).appUserId = userId;
  try {
    await resolveUserProfile(req, userId);
  } catch {
    res.status(503).json({ error: "The identity service is unavailable. Please try again." });
    return;
  }
  next();
};

export function userIdFromRequest(req: Request): string | null {
  return (req as AuthenticatedRequest).appUserId ?? getAuth(req).userId ?? null;
}

export function userProfileFromRequest(req: Request): {
  email: string | null;
  name: string | null;
} {
  const resolved = (req as AuthenticatedRequest).appUserProfile;
  if (resolved) return resolved;
  const claims = getAuth(req).sessionClaims as
    | Record<string, unknown>
    | undefined;
  const emailValue =
    claims?.email ?? claims?.email_address ?? claims?.primary_email_address;
  const nameValue =
    claims?.name ??
    [claims?.given_name, claims?.family_name].filter(Boolean).join(" ");

  return {
    email: typeof emailValue === "string" ? emailValue : null,
    name: typeof nameValue === "string" && nameValue.trim() ? nameValue : null,
  };
}

const profileCache = new Map<string, {
  expiresAt: number;
  profile: { email: string | null; name: string | null };
}>();

async function resolveUserProfile(req: Request, userId: string) {
  const claims = userProfileFromRequest(req);
  if (claims.email) return claims;
  const cached = profileCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    (req as AuthenticatedRequest).appUserProfile = cached.profile;
    return cached.profile;
  }
  // Clerk's standard session token does not include email/name. Resolve the
  // verified primary email server-side so email-based admin bootstrap works.
  const user = await clerkClient.users.getUser(userId);
  const primary = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
  const profile = {
    email: primary?.verification?.status === "verified" ? primary.emailAddress : null,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
  };
  if (profileCache.size > 1_000) profileCache.clear();
  profileCache.set(userId, { profile, expiresAt: Date.now() + 30_000 });
  (req as AuthenticatedRequest).appUserProfile = profile;
  return profile;
}

export async function isPlatformAdmin(
  userId: string,
  email?: string | null,
): Promise<boolean> {
  const configuredIds = (process.env.SUPER_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (configuredIds.includes(userId)) return true;
  const configuredEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (email && configuredEmails.includes(email.toLowerCase())) return true;

  const [admin] = await db
    .select({ clerkUserId: platformAdminsTable.clerkUserId })
    .from(platformAdminsTable)
    .where(eq(platformAdminsTable.clerkUserId, userId))
    .limit(1);
  return Boolean(admin);
}

export async function authorizeStoreAdmin(
  req: Request,
  res: Response,
  storeId: string,
): Promise<string | null> {
  const userId = userIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return null;
  }

  if (
    await isPlatformAdmin(userId, userProfileFromRequest(req).email)
  ) {
    return userId;
  }

  const [membership] = await db
    .select({ role: storeMembershipsTable.role })
    .from(storeMembershipsTable)
    .where(
      and(
        eq(storeMembershipsTable.storeId, storeId),
        eq(storeMembershipsTable.clerkUserId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    res.status(404).json({ error: "Store not found." });
    return null;
  }
  if (membership.role !== "store_admin") {
    res.status(403).json({ error: "Store administrator access is required." });
    return null;
  }
  return userId;
}

export async function authorizePlatformAdmin(
  req: Request,
  res: Response,
): Promise<string | null> {
  const userId = userIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return null;
  }
  let profile;
  try {
    profile = await resolveUserProfile(req, userId);
  } catch {
    res.status(503).json({ error: "The identity service is unavailable. Please try again." });
    return null;
  }
  if (!(await isPlatformAdmin(userId, profile.email))) {
    res.status(403).json({ error: "Super admin access is required." });
    return null;
  }
  return userId;
}
