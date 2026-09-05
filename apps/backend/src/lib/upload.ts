import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { uploadBuffer } from "./storage.js";
import { env } from "../env.js";


export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
});

export const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2000 * 1024 * 1024 },
});

export const videoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 },
});

export function uploadErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {

    if (err instanceof multer.MulterError) {
        const message = err.code === "LIMIT_FILE_SIZE" ? "file too large" : err.code === "LIMIT_UNEXPECTED_FILE" ? `Unexpected file field "${err.field}".`
            : err.message;
        res.status(400).json({ error: message });
        return;
    }
    next(err);

}

export const extFromMime = (mime: string): string => {
    const map: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
    };
    return map[mime] ?? "png";
};
/** Encode an uploaded file as a base64 data URL (sent to providers that can't reach MinIO). */
export const toDataUrl = (file: Express.Multer.File): string =>
    `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
