import { Router } from "express";
import { prisma, type FaceSwap } from "@repo/db";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth.js";
import { extFromMime, upload, videoUpload } from "../lib/upload.js";
import { getPublicUrl, uploadBuffer } from "../lib/storage.js";
import { faceSwap } from "../lib/facefusion.js";
import { faceSwapVideo } from "../lib/facefusion.js";


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

// ---------------------------------------------------------------------------
// POST /video — Video face-swap (local FaceFusion, $0 cost)
// ---------------------------------------------------------------------------
// Accepts a face photo ("source") and a video file ("target"), swaps the face
// onto every frame of the video using the local FaceFusion Docker container,
// uploads the result to object storage, and returns the download URL.
// No credits are deducted — this runs entirely on local hardware.
faceSwapsRouter.post(
    "/video",
    requireAuth,
    videoUpload.fields([
        { name: "source", maxCount: 1 },
        { name: "target", maxCount: 1 },
    ]),
    async (req: AuthedRequest, res) => {
        const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;

        const source = files.source?.[0];
        const target = files.target?.[0];

        if (!source || !target) {
            res.status(400).json({ error: "Both a face image (source) and a video file (target) are required" });
            return;
        }

        // Validate that the target is actually a video
        const videoMimes = ["video/mp4", "video/webm", "video/quicktime"];
        if (!videoMimes.includes(target.mimetype)) {
            res.status(400).json({
                error: `Target must be a video file (mp4/webm/mov). Got: ${target.mimetype}`,
            });
            return;
        }

        console.log(`[video-swap] Starting video face-swap for user ${req.userId}`);
        console.log(`[video-swap] Source: ${source.originalname} (${source.mimetype}), Target: ${target.originalname} (${target.mimetype}, ${(target.size / 1024 / 1024).toFixed(1)}MB)`);

        try {
            const result = await faceSwapVideo(
                { buffer: source.buffer, mimetype: source.mimetype, filename: source.originalname || "source.jpg" },
                { buffer: target.buffer, mimetype: target.mimetype, filename: target.originalname || "target.mp4" },
            );

            // Upload swapped video to object storage (Cloudflare R2)
            const ext = target.mimetype === "video/webm" ? "webm" : target.mimetype === "video/quicktime" ? "mov" : "mp4";
            const outputKey = await uploadBuffer(result.buffer, result.contentType, "video-swaps", ext);
            const outputUrl = getPublicUrl(outputKey);

            console.log(`[video-swap] Success! Output: ${outputKey} (${(result.buffer.length / 1024 / 1024).toFixed(1)}MB)`);

            res.status(201).json({
                success: true,
                outputUrl,
                outputKey,
                contentType: result.contentType,
                sizeBytes: result.buffer.length,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Video face swap failed";
            console.error("[video-swap] Failed:", message);
            res.status(502).json({ error: message });
        }
    },
);

