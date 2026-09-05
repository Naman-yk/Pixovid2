import crypto from "node:crypto";

import { env } from "../env.js";

interface RazorpayOrder {
    id: string;
    amount: number;
    currency: string;
    receipt: string;
    status: string;
}


const RAZORPAY_API = "https://api.razorpay.com/v1";

export function isRazorpayConfigured(): boolean {
    return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}


function requireKeys(): { id: string; secret: string } {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
        throw new Error(
            "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the backend.env",

        );
    }
    return { id: env.RAZORPAY_KEY_ID, secret: env.RAZORPAY_KEY_SECRET };
}

export async function createOrder(params: {

    amount: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;

}): Promise<RazorpayOrder> {

    const { id, secret } = requireKeys();
    // this is creating an orders 

    const auth = Buffer.from(`${id}:${secret}`).toString("base64");

    const res = await fetch(`${RAZORPAY_API}/orders`, {
        method: "POST",

        headers: {

            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",

        },
        body: JSON.stringify({
            amount: params.amount,
            currency: params.currency,
            receipt: params.receipt,
            notes: params.notes,
        }
        ),




    });

    if (!res.ok) {
        throw new Error(`Razorpay order creation failed: ${res.status} ${await res.text()}`);

    }

    return (await res.json()) as RazorpayOrder;



}

export function verifyPaymentSignature(params: {

    orderId: string;
    paymentId: string;
    signature: string;
}): boolean {

    const { secret } = requireKeys();

    const expected = crypto
        .createHmac("sha256", secret)
        .update(`${params.orderId}|${params.paymentId}`)
        .digest("hex");

    return timingSafeEqual(expected, params.signature);

}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {

    if (!env.RAZORPAY_WEBHOOK_SECRET) return false;

    const expected = crypto
        .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

    return timingSafeEqual(expected, signature);

}

function timingSafeEqual(a: string, b: string) {

    const ab = Buffer.from(a);

    const bb = Buffer.from(b);

    if (ab.length !== bb.length) {
        return false;

    }
    return crypto.timingSafeEqual(ab, bb);
}



