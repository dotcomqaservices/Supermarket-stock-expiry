import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storesRouter from "./stores";
import inventoryRouter from "./inventory";
import staffRouter from "./staff";
import platformRouter from "./platform";
import whatsappRouter from "./whatsapp";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(settingsRouter);
router.use(storesRouter);
router.use(inventoryRouter);
router.use(staffRouter);
router.use(platformRouter);
router.use(whatsappRouter);

export default router;
