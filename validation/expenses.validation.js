import { z, registry } from "../swagger/registry.js";

const bearerAuth = [{ bearerAuth: [] }];

export const CreateExpenseBodySchema = z
  .object({
    amount: z.coerce
      .number({ required_error: "Amount is required" })
      .positive("Amount must be greater than 0")
      .openapi({ example: 1500 }),

    date: z
      .string({ required_error: "Date is required" })
      .openapi({ example: "2026-05-06" }),

    description: z
      .string()
      .trim()
      .max(500, "Description cannot exceed 500 characters")
      .optional()
      .openapi({ example: "Client meeting travel expense" }),

    category: z
      .string({ required_error: "Category is required" })
      .min(1, "Category is required")
      .openapi({ example: "6819d8fd6f9f4f7f7c5a1a12", description: "ExpenseCategory ObjectId" }),
  })
  .openapi("CreateExpenseBody");

export const UpdateExpenseBodySchema = z
  .object({
    amount: z.coerce.number().positive("Amount must be greater than 0").optional().openapi({ example: 2000 }),
    date: z.string().optional().openapi({ example: "2026-05-10" }),
    description: z.string().trim().max(500).optional().openapi({ example: "Updated description" }),
    category: z.string().optional().openapi({ example: "6819d8fd6f9f4f7f7c5a1a12" }),
  })
  .openapi("UpdateExpenseBody");

export const ReviewExpenseBodySchema = z
  .object({
    status: z
      .enum(["approved", "rejected"], { required_error: "Status is required" })
      .openapi({ example: "approved" }),
    comment: z
      .string()
      .trim()
      .max(500)
      .optional()
      .openapi({ example: "Approved. Valid business expense." }),
  })
  .openapi("ReviewExpenseBody");

export const ReimburseExpenseBodySchema = z
  .object({
    payrollIncluded: z
      .boolean()
      .optional()
      .openapi({ example: true, description: "Whether this reimbursement is included in the salary slip" }),
  })
  .openapi("ReimburseExpenseBody");

export const ExpenseIdParamSchema = z
  .object({
    id: z.string().min(1).openapi({ example: "6819d8fd6f9f4f7f7c5a1a12" }),
  })
  .openapi("ExpenseIdParam");

export const ExpenseQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().openapi({ example: 1 }),
    limit: z.coerce.number().int().min(1).max(100).optional().openapi({ example: 10 }),
    status: z
      .enum(["all", "draft", "pending", "approved", "rejected", "reimbursed"])
      .optional()
      .openapi({ example: "pending" }),
    category: z.string().optional().openapi({ example: "6819d8fd6f9f4f7f7c5a1a12" }),
    fromDate: z.string().optional().openapi({ example: "2026-05-01" }),
    toDate: z.string().optional().openapi({ example: "2026-05-31" }),
    employeeId: z
      .string()
      .optional()
      .openapi({ example: "6819d8fd6f9f4f7f7c5a1a99", description: "Filter by specific employee (admin only)" }),
    month: z.coerce.number().int().min(1).max(12).optional().openapi({ example: 5 }),
    year: z.coerce.number().int().min(2020).optional().openapi({ example: 2026 }),
  })
  .openapi("ExpenseQuery");

export const MonthlyReportQuerySchema = z
  .object({
    month: z.coerce.number({ required_error: "month is required" }).int().min(1).max(12).openapi({ example: 5 }),
    year: z.coerce.number({ required_error: "year is required" }).int().min(2020).openapi({ example: 2026 }),
    employeeId: z.string().optional().openapi({ example: "6819d8fd6f9f4f7f7c5a1a99" }),
  })
  .openapi("MonthlyReportQuery");

// ─── Swagger path registrations ──────────────────────────────────────────────

registry.registerPath({
  method: "post",
  path: "/expenses",
  tags: ["Expenses"],
  summary: "Submit a new expense (employee)",
  description: "Multipart form-data. Attach receipt as `receipt` field (image or PDF, max 10 MB).",
  security: bearerAuth,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateExpenseBodySchema } },
    },
  },
  responses: {
    201: { description: "Expense submitted successfully" },
    400: { description: "Validation error" },
    401: { description: "Unauthorized" },
    404: { description: "Category not found" },
    500: { description: "Internal server error" },
  },
});

registry.registerPath({
  method: "get",
  path: "/expenses/my",
  tags: ["Expenses"],
  summary: "Get my expenses (employee)",
  security: bearerAuth,
  request: { query: ExpenseQuerySchema },
  responses: {
    200: { description: "Paginated list of the authenticated employee's expenses" },
    401: { description: "Unauthorized" },
  },
});

registry.registerPath({
  method: "get",
  path: "/expenses",
  tags: ["Expenses"],
  summary: "Get all org expenses (admin / HR / manager)",
  security: bearerAuth,
  request: { query: ExpenseQuerySchema },
  responses: {
    200: { description: "Paginated org expense list" },
    403: { description: "Forbidden — admin/hr/manager only" },
  },
});

registry.registerPath({
  method: "get",
  path: "/expenses/summary",
  tags: ["Expenses"],
  summary: "Expense summary by status (admin / HR)",
  security: bearerAuth,
  responses: {
    200: { description: "Counts and totals grouped by status" },
    403: { description: "Forbidden" },
  },
});

registry.registerPath({
  method: "get",
  path: "/expenses/report",
  tags: ["Expenses"],
  summary: "Monthly expense report per employee (admin / HR) — payroll integration point",
  security: bearerAuth,
  request: { query: MonthlyReportQuerySchema },
  responses: {
    200: { description: "Monthly report grouped by employee with grand total" },
    400: { description: "month and year are required" },
    403: { description: "Forbidden" },
  },
});

registry.registerPath({
  method: "get",
  path: "/expenses/{id}",
  tags: ["Expenses"],
  summary: "Get expense by ID",
  security: bearerAuth,
  request: { params: ExpenseIdParamSchema },
  responses: {
    200: { description: "Expense record" },
    403: { description: "Forbidden — not your expense" },
    404: { description: "Not found" },
  },
});

registry.registerPath({
  method: "put",
  path: "/expenses/{id}",
  tags: ["Expenses"],
  summary: "Update a pending expense (employee only)",
  description: "Multipart form-data. Re-upload receipt via `receipt` field.",
  security: bearerAuth,
  request: {
    params: ExpenseIdParamSchema,
    body: { content: { "application/json": { schema: UpdateExpenseBodySchema } } },
  },
  responses: {
    200: { description: "Expense updated" },
    400: { description: "Cannot edit a non-pending expense" },
    403: { description: "Not your expense" },
    404: { description: "Not found" },
  },
});

registry.registerPath({
  method: "delete",
  path: "/expenses/{id}",
  tags: ["Expenses"],
  summary: "Delete a draft/pending expense",
  security: bearerAuth,
  request: { params: ExpenseIdParamSchema },
  responses: {
    200: { description: "Expense deleted" },
    400: { description: "Cannot delete approved/reimbursed expense" },
    403: { description: "Access denied" },
    404: { description: "Not found" },
  },
});

registry.registerPath({
  method: "put",
  path: "/expenses/{id}/review",
  tags: ["Expenses"],
  summary: "Approve or reject an expense (admin / HR / manager)",
  security: bearerAuth,
  request: {
    params: ExpenseIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: ReviewExpenseBodySchema } },
    },
  },
  responses: {
    200: { description: "Expense approved or rejected" },
    400: { description: "Expense is not pending" },
    403: { description: "Forbidden" },
    404: { description: "Not found" },
  },
});

registry.registerPath({
  method: "put",
  path: "/expenses/{id}/reimburse",
  tags: ["Expenses"],
  summary: "Mark an approved expense as reimbursed (admin / HR)",
  security: bearerAuth,
  request: {
    params: ExpenseIdParamSchema,
    body: { content: { "application/json": { schema: ReimburseExpenseBodySchema } } },
  },
  responses: {
    200: { description: "Expense marked as reimbursed" },
    400: { description: "Expense is not approved" },
    403: { description: "Forbidden" },
    404: { description: "Not found" },
  },
});
