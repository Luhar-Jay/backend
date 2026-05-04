import express from "express";
import {
  punchIn,
  punchOut,
  startBreak,
  endBreak,
  getAttendance,
  correctAttendance,
  getAttendanceSummary,
  requestRegularization,
  resolveRegularization,
  getRegularizations,
} from "../controllers/attendence.controller.js";
import { authenticateMiddleware } from "../middleware/authenticate.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import "../validation/attendance.validation.js";

const router = express.Router();

// All routes require authentication
const auth = authenticateMiddleware;

// Punch operations (any authenticated user, self-scoped)
router.post("/punch-in", auth, punchIn);
router.post("/start-break", auth, startBreak);
router.post("/end-break", auth, endBreak);
router.post("/punch-out", auth, punchOut);

// Queries — specific paths before parameterised /:id routes
router.get("/", auth, getAttendance);
router.get("/summary", auth, getAttendanceSummary);
router.get(
  "/regularizations",
  auth,
  authorize("super-admin", "admin", "hr", "manager"),
  getRegularizations
);

// Admin / HR: correct an existing record
router.put(
  "/:id/correct",
  auth,
  authorize("super-admin", "admin", "hr"),
  correctAttendance
);

// Regularization: employee submits a request; admin/HR resolves it
router.post("/:id/regularize", auth, requestRegularization);
router.put(
  "/:id/regularize",
  auth,
  authorize("super-admin", "admin", "hr"),
  resolveRegularization
);

export default router;
