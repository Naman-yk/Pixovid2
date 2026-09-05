import { Router, type Request, type Response } from "express";


import { requireAuth } from "../middlewares/requireAuth.js";



import { listImageModels, listVideoModels, listSwapModels } from "../lib/openrouter.js";

export const modelsRouter = Router();

function modelsHandler(list: () => Promise<unknown>) {

    return async (_req: Request, res: Response) => {
        try {
            res.json(await list());
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load models";
            res.status(502).json({ error: message });
        }
    };
}

modelsRouter.get("/", requireAuth, modelsHandler(listVideoModels));

modelsRouter.get("/video", requireAuth, modelsHandler(listVideoModels));

modelsRouter.get("/image", requireAuth, modelsHandler(listImageModels));

modelsRouter.get("/swap", requireAuth, modelsHandler(listSwapModels));
