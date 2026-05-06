import express from "express";
import { authenticateMiddleware } from "../middleware/authenticate.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { uploadReceiptFile } from "../middleware/multer.middleare.js";
import {
  createExpense,
  getMyExpenses,
  getExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
  reviewExpense,
  markReimbursed,
  getMonthlyReport,
  getExpenseSummary,
} from "../controllers/expenses.controller.js";
import {
  CreateExpenseBodySchema,
  UpdateExpenseBodySchema,
  ReviewExpenseBodySchema,
  ReimburseExpenseBodySchema,
  ExpenseIdParamSchema,
  ExpenseQuerySchema,
  MonthlyReportQuerySchema,
} from "../validation/expenses.validation.js";

const router = express.Router();

router.post(
  "/",
  authenticateMiddleware,
  uploadReceiptFile.single("receipt"),
  validate({ body: CreateExpenseBodySchema }),
  createExpense
);

router.get(
  "/my",
  authenticateMiddleware,
  validate({ query: ExpenseQuerySchema }),
  getMyExpenses
);

router.get(
  "/",
  authenticateMiddleware,
  authorize("admin", "hr", "manager", "super-admin"),
  validate({ query: ExpenseQuerySchema }),
  getExpenses
);

router.get(
  "/summary",
  authenticateMiddleware,
  authorize("admin", "hr", "super-admin"),
  getExpenseSummary
);

router.get(
  "/report",
  authenticateMiddleware,
  authorize("admin", "hr", "super-admin"),
  validate({ query: MonthlyReportQuerySchema }),
  getMonthlyReport
);

router.get(
  "/:id",
  authenticateMiddleware,
  validate({ params: ExpenseIdParamSchema }),
  getExpenseById
);

router.put(
  "/:id",
  authenticateMiddleware,
  uploadReceiptFile.single("receipt"),
  validate({ params: ExpenseIdParamSchema, body: UpdateExpenseBodySchema }),
  updateExpense
);

router.delete(
  "/:id",
  authenticateMiddleware,
  validate({ params: ExpenseIdParamSchema }),
  deleteExpense
);

router.put(
  "/:id/review",
  authenticateMiddleware,
  authorize("admin", "hr", "manager", "super-admin"),
  validate({ params: ExpenseIdParamSchema, body: ReviewExpenseBodySchema }),
  reviewExpense
);

router.put(
  "/:id/reimburse",
  authenticateMiddleware,
  authorize("admin", "hr", "super-admin"),
  validate({ params: ExpenseIdParamSchema, body: ReimburseExpenseBodySchema }),
  markReimbursed
);

export default router;
