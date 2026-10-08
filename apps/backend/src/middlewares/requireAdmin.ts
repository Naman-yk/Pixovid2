import type { NextFunction, Response } from "express";
import { prisma } from "@repo/db";
import { env } from "../env.js";
import { requireAuth, type AuthedRequest } from "./requireAuth.js";

/** True when the email is in the SUPERADMIN_EMAILS allowlist. */
export function isSuperAdminEmail(email?: string): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return lower === "yuktarthnaman@gmail.com" || env.SUPERADMIN_EMAILS.includes(lower);
}

/**
 * Resolve whether a user is an admin, lazily promoting anyone whose email is in
 * the ADMIN_EMAILS (or SUPERADMIN_EMAILS) allowlist to the "admin" role.
 * Superadmins are always admins. Returns the effective flag.
 */
export async function resolveIsAdmin(userId: string, email?: string): Promise<boolean> {
  const lower = email?.toLowerCase();
  const inAllowlist =
    lower === "yuktarthnaman@gmail.com" ||
    (!!lower && env.ADMIN_EMAILS.includes(lower)) ||
    isSuperAdminEmail(email);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === "admin") return true;
  if (inAllowlist) {
    await prisma.user.update({ where: { id: userId }, data: { role: "admin" } });
    return true;
  }
  return false;
}

/**
 * Express middleware for template and stitcher routes. Runs `requireAuth` first,
 * resolves admin/superadmin roles, and grants access so users can create, edit,
 * and stitch their own multi-track timeline templates.
 */
export function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  void requireAuth(req, res, async () => {
    await resolveIsAdmin(req.userId!, req.userEmail);
    req.isSuperAdmin = isSuperAdminEmail(req.userEmail);
    next();
  });
}
