import { prisma, type CreditTxnType } from "@repo/db"
import { env } from "../env.js";


export type GenerationAction = "video" | "image" | "template_render";

export function actionCost(action: GenerationAction): number {
    switch (action) {
        case "video":
            return env.CREDITS_PER_VIDEO;
        case "image":
            return env.CREDITS_PER_IMAGE;
        case "template_render":
            return env.CREDITS_PER_TEMPLATE_RENDER;
    }
}

export const REFERENCE_TYPE: Record<GenerationAction, string> = {
    video: "video",

    image: "image",

    template_render: "template_render",
};

export interface CreditPack {

    id: string;
    name: string;

    description: string;

    priceInr: number;

    amountPaise: number;

    baseCredits: number;

    bonusCredits: number;

}

export const CREDIT_PACKS: CreditPack[] = [
    {
        id: "starter",
        name: "Starter",
        description: "Enough credits to try things out.",
        priceInr: 499,
        amountPaise: 499_00,
        baseCredits: 500,
        bonusCredits: 0,
    },
    {
        id: "pro",
        name: "Pro",
        description: "Best for regular creators — 10% bonus credits.",
        priceInr: 1999,
        amountPaise: 1999_00,
        baseCredits: 2000,
        bonusCredits: 200,
    },
    {
        id: "studio",
        name: "Studio",
        description: "For heavy use — 20% bonus credits.",
        priceInr: 4999,
        amountPaise: 4999_00,
        baseCredits: 5000,
        bonusCredits: 1000,
    },
];

export function findPack(packId: string): CreditPack | undefined {
    return CREDIT_PACKS.find((p) => p.id === packId);

}

export const packTotalCredits = (pack: CreditPack): number =>
    pack.baseCredits + pack.bonusCredits;



export class InsufficientCreditsError extends Error {

    constructor(
        public required: number,
        public available: number,
    ) {
        super(`Insufficient credits: need ${required}, have ${available}.`);

        this.name = "InsufficientCreditsError";

    }

}

export async function getBalance(userId: string): Promise<number> {

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });

    return user?.credits ?? 0;
}

interface LedgerRef {
    referenceType?: string;
    referenceId?: string;
    description?: string;
}

export async function spendCredits(
    userId: string,

    amount: number,
    ref: LedgerRef = {},
): Promise<number> {

    if (amount <= 0) return getBalance(userId);

    return prisma.$transaction(async (tx) => {

        const updated = await tx.user.updateMany({
            where: { id: userId, credits: { gte: amount } },
            data: { credits: { decrement: amount } },

        });
        if (updated.count === 0) {
            const available = (
                await tx.user.findUnique({ where: { id: userId }, select: { credits: true } })
            )?.credits ?? 0;

            throw new InsufficientCreditsError(amount, available);
        }

        const after = (await tx.user.findUnique({ where: { id: userId }, select: { credits: true } }))!.credits;

        await tx.creditTransaction.create({
            data: {
                userId,
                type: "SPEND",
                amount: -amount,
                balanceAfter: after,
                referenceType: ref.referenceType,
                referenceId: ref.referenceId,
                description: ref.description,
            }
        })

        return after;
    })
}

export async function addCredits(
    userId: string,
    amount: number,
    type: CreditTxnType,

    ref: LedgerRef = {},

): Promise<number> {
    if (amount <= 0) return getBalance(userId);

    return prisma.$transaction(async (tx) => {

        const user = await tx.user.update({
            where: { id: userId },
            data: { credits: { increment: amount } },
            select: { credits: true },

        });

        await tx.creditTransaction.create({
            data: {
                userId,
                type,
                amount,
                balanceAfter: user.credits,
                description: ref.description,
                referenceType: ref.referenceType,
                referenceId: ref.referenceId,
            },
        });

        return user.credits;


    });
}

export async function refundCredits(
    userId: string,
    amount: number,
    ref: LedgerRef = {},
): Promise<void> {

    if (amount <= 0) return;

    const rows = await prisma.creditTransaction.findMany({
        where: {
            userId,
            referenceType: ref.referenceType,
            referenceId: ref.referenceId,
            type: { in: ["SPEND", "REFUND"] },

        },
        select: { type: true, amount: true },
    });

    const net = rows.reduce((sum, r) => sum + (r.amount), 0);
    const outstanding = -net;

    const toRefund = Math.min(amount, outstanding);

    if (toRefund <= 0) return;
    await addCredits(userId, toRefund, "REFUND", {
        referenceType: ref.referenceType,
        referenceId: ref.referenceId,
        description: ref.description ?? "Refund for failed generation",
    });







}





