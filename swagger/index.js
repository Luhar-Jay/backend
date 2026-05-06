import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry.js';

import '../validation/auth.validation.js';
import '../validation/attendance.validation.js';
import '../validation/project.validation.js';
import '../validation/task.validation.js';
import '../validation/leave.validation.js';
import '../validation/salary.validation.js';
import '../validation/hiring.validation.js';
import '../validation/notes.validation.js';
import '../validation/expenses.validation.js';
import '../validation/expenseCategory.validation.js';
export function generateOpenAPIDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'TMS — Task Management System API',
      version: '1.0.0',
      description:
        'TMS API v1. Protected routes expect an access JWT in the HttpOnly `accessToken` cookie (credentials: include from the SPA).',
    },
    servers: [{ url: '/api/v1', description: 'TMS API v1' }],
  });
}
