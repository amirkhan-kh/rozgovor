import { Router } from "express";
import { bitrixWebhook } from "../controllers/webhooks.controller";

const router = Router();

router.post("/bitrix", bitrixWebhook);

export default router;
