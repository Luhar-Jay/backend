import { z, registry } from "../swagger/registry.js";

const bearerAuth = [{ bearerAuth: [] }];

export const ExpenseCategoryBodySchema = z
  .object({
    name: z.string().min(1, "Name is required").openapi({ example: "Travel" }),
    isActive: z.boolean().optional().openapi({ example: true }),
  })
  .openapi("ExpenseCategoryBody");

export const ExpenseCategoryIdParamSchema = z
  .object({
    id: z.string().min(1).openapi({ example: "6819d8fd6f9f4f7f7c5a1a12" }),
  })
  .openapi("ExpenseCategoryIdParam");

registry.registerPath({
  method: "post",
  path: "/expense-categories",
  tags: ["Expense Categories"],
  summary: "Create an expense category (admin / HR)",
  security: bearerAuth,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ExpenseCategoryBodySchema } },
    },
  },
  responses: {
    201: { description: "Expense category created successfully" },
    400: { description: "Validation error" },
    401: { description: "Unauthorized" },
    409: { description: "Category with this name already exists" },
    500: { description: "Internal server error" },
  },
});

registry.registerPath({
  method: "get",
  path: "/expense-categories",
  tags: ["Expense Categories"],
  summary: "Get all active expense categories",
  security: bearerAuth,
  responses: {
    200: { description: "List of active expense categories" },
    401: { description: "Unauthorized" },
  },
});

registry.registerPath({
  method: "put",
  path: "/expense-categories/{id}",
  tags: ["Expense Categories"],
  summary: "Update an expense category (admin / HR)",
  security: bearerAuth,
  request: {
    params: ExpenseCategoryIdParamSchema,
    body: { content: { "application/json": { schema: ExpenseCategoryBodySchema } } },
  },
  responses: {
    200: { description: "Expense category updated successfully" },
    404: { description: "Category not found" },
  },
});

registry.registerPath({
  method: "delete",
  path: "/expense-categories/{id}",
  tags: ["Expense Categories"],
  summary: "Deactivate an expense category (admin / HR)",
  security: bearerAuth,
  request: { params: ExpenseCategoryIdParamSchema },
  responses: {
    200: { description: "Expense category deactivated successfully" },
    404: { description: "Category not found" },
  },
});
