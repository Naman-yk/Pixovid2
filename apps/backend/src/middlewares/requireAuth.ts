import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";

import { auth } from "../auth";

export interface AuthedRequest extends Request {
    userId?: string;
    userEmail?: string;
    isSuperAdmin?: boolean;
}

export async function requireAuth(
    req: AuthedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });

        if (!session?.user) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        req.userId = session.user.id;
        req.userEmail = session.user.email;
        next();
    } catch (error) {
        console.error("Auth error:", error);
        res.status(401).json({ error: "Unauthorized" });
    }
}