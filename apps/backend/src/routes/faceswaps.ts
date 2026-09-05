import { Router } from "express";
import { prisma, type FaceSwap } from "@repo/db";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth.js";
import { extFromMime, upload } from "../lib/upload.js";
import { getPublicUrl, uploadBuffer } from "../lib/storage.js";
import { faceSwap } from "../lib/facefusion.js";


export const faceSwapsRouter: Router = Router();

// Create
const createSchema = z.object({
    name: z.string().min(1, "Name is required"),
    sourceImageKey: z.string().min(1, "Source image key is required"),
    targetImageKey: z.string().min(1, "Target image key is required"),
    gender: z.string().optional(),
});

function serializeFaceSwap(swap: FaceSwap) {
    return {
        ...swap,
        sourceUrl: getPublicUrl(swap.sourceKey),
        targetUrl: getPublicUrl(swap.targetKey),
        outputUrl: swap.outputKey ? getPublicUrl(swap.outputKey) : null,
    };
}

faceSwapsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
    try {
        const swaps = await prisma.faceSwap.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: "desc" },
        });

        return res.json({
            success: true,
            data: swaps.map(serializeFaceSwap),
        })

    } catch (error) {
        console.log(error);
    }


});
faceSwapsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
    const swap = await prisma.faceSwap.findFirst({
        where: { id: req.params.id, userId: req.userId },

    });

    if (!swap) {
        res.status(404).json({ error: "Not Found" });
        return;
    }
    res.json(serializeFaceSwap(swap));
});

faceSwapsRouter.post(
    "/",
    requireAuth,
    upload.fields([
        { name: " source", maxCount: 1 },
        { name: "target", maxCount: 1 },
    ]),
    async (req: AuthedRequest, res) => {

        const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;

        const source = files.source?.[0];

        const target = files.target?.[0];

        if (!source || !target) {
            res.status(400).json({ error: "Both a base image and face image are required" });

            return;
        }

        const [sourceKey, targetKey] = await Promise.all([
            uploadBuffer(source.buffer, source.mimetype, "inputs", extFromMime(source.mimetype)),
            uploadBuffer(target.buffer, target.mimetype, "inputs", extFromMime(target.mimetype)),
        ]);

        const swap = await prisma.faceSwap.create({
            data: { userId: req.userId!, sourceKey, targetKey, status: "IN_PROGRESS" },

        });

        try {
            const result = await faceSwap(
                { buffer: source.buffer, mimetype: source.mimetype, filename: `source.${extFromMime(source.mimetype)}` },
                { buffer: target.buffer, mimetype: target.mimetype, filename: `target.${extFromMime(target.mimetype)}` },
            );

            const ext = extFromMime(result.contentType);
            const outputKey = await uploadBuffer(result.buffer, result.contentType, "faceswaps", ext);

            const updated = await prisma.faceSwap.update({
                where: { id: swap.id },
                data: { status: "COMPLETED", outputKey },
            });

            res.status(201).json(serializeFaceSwap(updated));







        } catch (err) {
            const message = err instanceof Error ? err.message : "Face swap failed";
            console.error("Face swap failed:", message);
            const failed = await prisma.faceSwap.update({
                where: { id: swap.id },
                data: { status: "FAILED", error: message },
            });
            res.status(502).json({ error: message, faceSwap: serializeFaceSwap(failed) });

        }





    },

);
