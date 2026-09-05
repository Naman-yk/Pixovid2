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


