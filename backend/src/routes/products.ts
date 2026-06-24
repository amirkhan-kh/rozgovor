import { Router } from "express";
import { listProducts, getProduct, updateProduct, listProductsWithStats } from "../controllers/products.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();
router.use(authMiddleware);

router.get("/", asyncHandler(listProducts));
router.get("/with-stats", asyncHandler(listProductsWithStats));
router.get("/:id", asyncHandler(getProduct));
router.patch("/:id", asyncHandler(updateProduct));

export default router;
