import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { prisma } from "@repo/db";
import { env } from "./env.js";
import { auth } from "./auth.js";

import { ensureBucket } from "./lib/storage.js";
import { videosRouter } from "./routes/videos.js";
import { imagesRouter } from "./routes/images.js";
import { faceSwapsRouter } from "./routes/faceswaps.js";
import { modelsRouter } from "./routes/models.js";
import { meRouter } from "./routes/me.js";
import { avatarsRouter } from "./routes/avatars.js";
import { templatesRouter, templateRendersRouter } from "./routes/templates.js";
import { adminTemplatesRouter } from "./routes/admintemplate.js";
import { creditsRouter, creditsWebhookHandler } from "./routes/credits.js";
import { uploadErrorHandler } from "./lib/upload.js";

const app = express();

app.use(
    cors({
        origin: env.FRONTEND_URL,
        credentials: true,
    }),
);

app.all("/api/auth/*", toNodeHandler(auth));

app.post("/api/credits/webhook",
    express.raw({ type: "*/*" }),
    creditsWebhookHandler
);

app.use(express.json());

// Health route
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/videos", videosRouter);
app.use("/api/images", imagesRouter);
app.use("/api/faceswaps", faceSwapsRouter);
app.use("/api/models", modelsRouter);
app.use("/api/me", meRouter);
app.use("/api/avatars", avatarsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/template-renders", templateRendersRouter);
app.use("/api/admin/templates", adminTemplatesRouter);
app.use("/api/credits", creditsRouter);
// Turn multer upload failures into clean 400s (mounted after all routers).
app.use(uploadErrorHandler);


async function failOrphanedRenders() {
    try {
        const orphaned = await prisma.templateRender.findMany({
            where: { status: "IN_PROGRESS" },
            select: { id: true },
        });
        if (orphaned.length === 0) return;

        const ids = orphaned.map((r) => r.id);
        await prisma.templateRender.updateMany({
            where: { id: { in: ids } },
            data: { status: "FAILED", error: "Render timed out (system restart)" },
        });
        
        await prisma.templateRenderBlock.updateMany({
            where: {
                renderId: { in: ids },
                phase: { in: ["QUEUED", "FACE_SWAP", "VIDEO_GENERATION", "RETRYING", "STITCHING"] }
            },
            data: { phase: "FAILED", error: "Interrupted by server error" },
        });
        console.log(`↺ Marked ${ids.length} interrupted render(s) as failed on startup.`);

    } catch (err) {
        console.error("⚠️  Could not reconcile interrupted renders:", err instanceof Error ? err.message : err);
    }
}

async function start(){
    await ensureBucket().catch((err) => {
       console.error("⚠️  Could not ensure object-store bucket exists:", err.message);
    });
    
    await failOrphanedRenders();
    
    app.listen(env.PORT, () => {
        console.log(`🚀 Backend listening on ${env.BACKEND_URL} (port ${env.PORT}) Started`);
    });
}
start();
