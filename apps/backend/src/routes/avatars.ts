import { Router } from "express";
import { z } from "zod";
import { prisma, type Avatar } from "@repo/db";

import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth.js"

import { getPublicUrl, uploadBuffer } from "../lib/storage.js";

import { extFromMime, upload } from "../lib/upload.js";



export const avatarsRouter = Router();

const createSchema = z.object({
    name: z.string().min(1, "name is required"),
});

export function serializeAvatar(avatar: Avatar) {
    return {
        ...avatar,
        faceUrl: avatar.faceKey ? getPublicUrl(avatar.faceKey) : undefined,
        sourceImageUrls: avatar.sourceImageKeys.map(getPublicUrl),
    };
}

avatarsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
    try {
        const avatars = await prisma.avatar.findMany({
            where: { userId: req.userId },
            orderBy: [{ createdAt: "desc" }],
        });
        res.json(avatars.map(serializeAvatar));
    } catch (error) {
        console.error("Error fetching avatars:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

avatarsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
    try {
        const avatar = await prisma.avatar.findFirst({
            where: { id: req.params.id, userId: req.userId },
        });

        if (!avatar) {
            res.status(404).json({ error: "Not found" });
            return;
        }
        res.json(serializeAvatar(avatar));
    } catch (error) {
        console.error("Error fetching avatar:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

avatarsRouter.post(
    "/",
    requireAuth,
    upload.fields([
        { name: "images", maxCount: 2 },
        { name: "face", maxCount: 2 },
    ]),
    async (req: AuthedRequest, res) => {
        const parsed = createSchema.safeParse(req.body);

        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.flatten().fieldErrors });
            return;
        }

        const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
        const images = files.images ?? files.face ?? [];
        if (images.length < 1) {
            res.status(400).json({ error: "at least 1 image required" });
            return;
        }
        const sourceImages = await Promise.all(
            images.map((f) => uploadBuffer(f.buffer, f.mimetype, "avatars", extFromMime(f.mimetype))),
        );

        const avatar = await prisma.avatar.create({
            data: {
                userId: req.userId!,
                name: parsed.data.name,
                sourceImageKeys: sourceImages,
                faceKey: sourceImages[0],
                status: "COMPLETED",
            },
        });
        res.status(201).json(serializeAvatar(avatar));
    },
);

avatarsRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
    try {
        const avatar = await prisma.avatar.findFirst({
            where: { id: req.params.id, userId: req.userId },
        });
        if (!avatar) {
            res.status(404).json({ error: "Not Found" });
            return;
        }
        await prisma.avatar.delete({ where: { id: avatar.id } });
        res.status(204).end();
    } catch (error) {
        console.error("Error deleting avatar:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

