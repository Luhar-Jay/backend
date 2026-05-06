import express from "express";
import { authenticateMiddleware } from "../middleware/authenticate.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createExpenseCategory,
  getExpenseCategories,
  updateExpenseCategory,
  deleteExpenseCategory,
} from "../controllers/expenseCategory.controller.js";
import {
  ExpenseCategoryBodySchema,
  ExpenseCategoryIdParamSchema,
} from "../validation/expenseCategory.validation.js";

const router = express.Router();

router.post(
  "/",
  authenticateMiddleware,
  authorize("admin", "hr", "super-admin"),
  validate({ body: ExpenseCategoryBodySchema }),
  createExpenseCategory
);

router.get("/", authenticateMiddleware, getExpenseCategories);

router.put(
  "/:id",
  authenticateMiddleware,
  authorize("admin", "hr", "super-admin"),
  validate({ params: ExpenseCategoryIdParamSchema, body: ExpenseCategoryBodySchema }),
  updateExpenseCategory
);

router.delete(
  "/:id",
  authenticateMiddleware,
  authorize("admin", "hr", "super-admin"),
  validate({ params: ExpenseCategoryIdParamSchema }),
  deleteExpenseCategory
);

export default router;
