import { Router } from "express";
import { prisma } from "@repo/db";

import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth.js";


import { resolveIsAdmin, isSuperAdminEmail } from "../middlewares/requireAdmin.js";

export const meRouter: Router = Router();

meRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
    const [isAdmin, user] = await Promise.all([
        resolveIsAdmin(req.userId!, req.userEmail),
        prisma.user.findUnique({ where: { id: req.userId }, select: { credits: true } }),
    ]);

    let credits = user?.credits ?? 0;

    // If superadmin or admin has low credits, auto-top-up for testing
    if (isAdmin && credits < 1000) {
        credits = 10000;
        await prisma.user.update({
            where: { id: req.userId },
            data: { credits },
        });
    }

    res.json({
        id: req.userId,
        email: req.userEmail,
        isAdmin,
        isSuperAdmin: isSuperAdminEmail(req.userEmail),
        credits,
    });
});

