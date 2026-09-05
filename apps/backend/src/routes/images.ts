import { Router } from "express";
import { z } from "zod";
import { prisma, type Image } from "@repo/db";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth.js";
import { upload, extFromMime, toDataUrl } from "../lib/upload.js";
import { generateImage } from "../lib/openrouter.js";
import { actionCost, getBalance, refundCredits, spendCredits } from "../lib/credit.js";
import { getPublicUrl, uploadBuffer } from "../lib/storage.js";
export const imagesRouter: Router = Router();

const createSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  model: z.string().min(1, "Model is required"),
  resolution: z.string().optional(),
  aspectRatio: z.string().optional(),

});


function serializeImage(image: Image) {
  return {
    ...image,
    imageUrl: image.imageKey ? getPublicUrl(image.imageKey) : null,
    referenceImageUrls: image.referenceImageKeys.map(getPublicUrl),
  };
}

imagesRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const images = await prisma.image.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json(images.map(serializeImage))
})

imagesRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const image = await prisma.image.findFirst({
    where: { id: req.params.id, userId: req.userId },

  });
  if (!image) {
    res.status(404).json({ error: "Not Found" });
    return;
  }
  res.json(serializeImage(image));
});

imagesRouter.post(
  "/",
  requireAuth,
  upload.fields([{ name: "referenceImages", maxCount: 8 }]),
  async (req: AuthedRequest, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten(), fieldErrors: parsed.error.flatten().fieldErrors });
      return;
    }

    const { prompt, model, resolution, aspectRatio } = parsed.data;

const cost = actionCost("image");

if ((await getBalance(req.userId!)) < cost) {
  res.status(402).json({ error: `Not enough credits. This image costs ${cost} credits.` });
  return;
}

const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;

const referenceImages = files.referenceImages ?? [];

const referenceImageKeys = await Promise.all(

  referenceImages.map((f) => uploadBuffer(f.buffer, f.mimetype, "inputs", extFromMime(f.mimetype))),


);

const image = await prisma.image.create({
  data: {
    userId: req.userId!,
    prompt,
    model,
    resolution,
    aspectRatio,
    referenceImageKeys,
    status: "IN_PROGRESS",

  },









});

try {
  await spendCredits(req.userId!, cost, {
    referenceType: "image",
    referenceId: image.id,
    description: "Image generation",
  });
} catch {
  await prisma.image.update({
    where: { id: image.id },
    data: { status: "FAILED", error: "Not enough credits." },
  });
  res.status(402).json({ error: `Not enough credits. This image costs ${cost} credits.` });
  return;
}


try {
  const generated = await generateImage({
    model,
    prompt,
    resolution,
    aspectRatio,
    references: referenceImages.map((f) => ({ url: toDataUrl(f) })),
  });
  const ext = extFromMime(generated.contentType);
  const imageKey = await uploadBuffer(generated.buffer, generated.contentType, "images", ext);
  const updated = await prisma.image.update({
    where: { id: image.id },
    data: { status: "COMPLETED", imageKey, cost: generated.cost },
  });
  res.status(201).json(serializeImage(updated));
} catch (err) {
  const message = err instanceof Error ? err.message : "Image generation failed";
  console.error("Image generation failed:", message);
  await refundCredits(req.userId!, cost, {
    referenceType: "image",
    referenceId: image.id,
    description: "Refund: image generation failed",
  });
  const failed = await prisma.image.update({
    where: { id: image.id },
    data: { status: "FAILED", error: message },
  });
  res.status(502).json({ error: message, image: serializeImage(failed) });
}
});
