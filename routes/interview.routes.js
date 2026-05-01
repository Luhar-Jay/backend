import express from "express";
import { authenticateMiddleware } from "../middleware/authenticate.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import {
  scheduleInterview,
  getInterviews,
  getInterviewById,
  submitFeedback,
  setInterviewResult,
} from "../controllers/interview.controller.js";

const router = express.Router();

router.post("/", authenticateMiddleware, authorize("admin", "hr", "manager"), scheduleInterview);
router.get("/", authenticateMiddleware, authorize("admin", "hr", "manager"), getInterviews);
router.get("/:id", authenticateMiddleware, authorize("admin", "hr", "manager"), getInterviewById);
router.post("/:id/feedback", authenticateMiddleware, submitFeedback);
router.patch("/:id/result", authenticateMiddleware, authorize("admin", "hr", "manager"), setInterviewResult);

export default router;
