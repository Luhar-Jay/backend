import express from "express";
import { authenticateMiddleware } from "../middleware/authenticate.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import {
  createHoliday,
  getHolidays,
  updateHoliday,
  deleteHoliday,
} from "../controllers/holiday.controller.js";

const router = express.Router();

router.get("/", authenticateMiddleware, getHolidays);
router.post("/", authenticateMiddleware, authorize("admin"), createHoliday);
router.put("/:id", authenticateMiddleware, authorize("admin"), updateHoliday);
router.delete("/:id", authenticateMiddleware, authorize("admin"), deleteHoliday);

export default router;
