import { env } from "../env.js";
export interface FaceSwapInput {
    buffer: Buffer,
    mimetype: string,
    filename: string;
}

export interface FaceSwapResult {
    buffer: Buffer;
    contentType: string;
}

const FACE_SWAP_TIMEOUT_MS = 15 * 60 * 1000;

export async function faceSwap(
    source: FaceSwapInput,
    target: FaceSwapInput,

): Promise<FaceSwapResult> {

    function createBlob(file: FaceSwapInput): Blob {
        const bytes = new Uint8Array(file.buffer);

        const blob = new Blob(
            [bytes],
            {
                type: file.mimetype,
            }

        );
        return blob;
    }

    const sourceBlob = createBlob(source);
    const targetBlob = createBlob(target);

        const form = new FormData();

        form.append(
            "source",
            sourceBlob,
            source.filename

        );

        form.append(
            "target",
            targetBlob,
            target.filename

        );

        let res: Response;

        try {
            res = await fetch(`${env.FACEFUSION_URL}/swap`, {
                method: 'POST',
                body: form,
                signal: AbortSignal.timeout(FACE_SWAP_TIMEOUT_MS),
            });
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            throw new Error(
                `Could not reach the FaceFusion service at ${env.FACEFUSION_URL} (${reason}). ` +
                `Start it with \`docker compose --profile facefusion up -d facefusion\`.`,
            );
        }

        if (!res.ok) {
            throw new Error(`face-fusion swap failed: ${res.status} ${await res.text()}`);
        }

        const buffer = Buffer.from(await res.arrayBuffer());


        return {
            buffer,
            contentType: res.headers.get("content-type") ?? "image/jpeg",
        };

    }

export interface VideoSwapResult {
    buffer: Buffer;
    contentType: string;
}

const VIDEO_SWAP_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes — video processing is slow on CPU

/**
 * Swap the face from `source` (image) onto every frame of `targetVideo` (video).
 * Requires the local FaceFusion Docker container to be running.
 */
export async function faceSwapVideo(
    source: FaceSwapInput,
    targetVideo: FaceSwapInput,
): Promise<VideoSwapResult> {
    function createBlob(file: FaceSwapInput): Blob {
        const bytes = new Uint8Array(file.buffer);
        return new Blob([bytes], { type: file.mimetype });
    }

    const sourceBlob = createBlob(source);
    const targetBlob = createBlob(targetVideo);

    const form = new FormData();
    form.append("source", sourceBlob, source.filename);
    form.append("target", targetBlob, targetVideo.filename);

    let res: Response;

    try {
        res = await fetch(`${env.FACEFUSION_URL}/swap-video`, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(VIDEO_SWAP_TIMEOUT_MS),
        });
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(
            `Could not reach the FaceFusion service at ${env.FACEFUSION_URL} (${reason}). ` +
            `Start it with \`docker compose --profile facefusion up -d facefusion\`.`,
        );
    }

    if (!res.ok) {
        throw new Error(`face-fusion video swap failed: ${res.status} ${await res.text()}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    return {
        buffer,
        contentType: res.headers.get("content-type") ?? "video/mp4",
    };
}
