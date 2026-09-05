import { randomUUID } from "node:crypto";
import { Client as MinioClient } from "minio";

import { env } from "../env.js";

export const minio = new MinioClient({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY
});

const BUCKET = env.MINIO_BUCKET;

const publicReadPolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
        {
            Action: ["s3:GetObject"],
            Effect: "Allow",
            Principal: "*",
            Resource: `arn:aws:s3:::${BUCKET}/*`
        }
    ]
});

const PROTOCOL = env.MINIO_USE_SSL ? "https" : "http";


const IS_DEFAULT_PORT = (env.MINIO_USE_SSL && env.MINIO_PORT === 443) || (!env.MINIO_USE_SSL && env.MINIO_PORT === 80);

const HOST = IS_DEFAULT_PORT ? env.MINIO_FRONTEND_ENDPOINT : `${env.MINIO_FRONTEND_ENDPOINT}:${env.MINIO_PORT}`;

export async function ensureBucket(): Promise<void> {
    const exists = await minio.bucketExists(BUCKET);
    if (!exists) {
        await minio.makeBucket(BUCKET);
        console.log(`📦 Created object-store bucket "${BUCKET}"`);
    }
    await minio.setBucketPolicy(BUCKET, publicReadPolicy);
    console.log(`📁 Configured public read policy for "${BUCKET}"`);


}

export async function uploadBuffer(
    buffer: Buffer,
    contentType?: string,
    prefix = "uploads",
    extension?: string,
): Promise<string> {
    const ext = extension ? `.${extension.replace(/^\./, "")}` : "";
    const key = `${prefix}/${randomUUID()}${ext}`;
    await minio.putObject(BUCKET, key, buffer, buffer.length, {
        "Content-Type": contentType,
    });
    return key;

}

export function getPublicUrl(key: string): string {
    const PUBLIC_BASE = env.MINIO_USE_SSL
        ? `https://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${BUCKET}`
        : `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${BUCKET}`;
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    return `${PUBLIC_BASE}/${encoded}`;
}

export async function downloadObject(key: string) {
    try {
        const stream = await minio.getObject(BUCKET, key);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    } catch (e) {
        console.error(`❌ Failed to stream video "${key}"`)
    }
}