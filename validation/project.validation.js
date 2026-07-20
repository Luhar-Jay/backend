import { z, registry } from '../swagger/registry.js';

const bearerAuth = [{ bearerAuth: [] }];

export const CreateProjectBodySchema = z
  .object({
    projectName: z.string().min(1, 'Project name is required').openapi({ example: 'TMS Backend' }),
    description: z.string().optional().openapi({ example: 'Task management backend API' }),
  })
  .openapi('CreateProjectBody');

export const UpdateProjectBodySchema = z
  .object({
    projectName: z.string().optional().openapi({ example: 'TMS Backend v2' }),
    description: z.string().optional().openapi({ example: 'Updated description' }),
  })
  .openapi('UpdateProjectBody');

export const ProjectIdParamSchema = z
  .object({ id: z.string().min(1).openapi({ example: '64b1f2c3d4e5f6a7b8c9d0e1' }) })
  .openapi('ProjectIdParam');

export const StatusParamSchema = z
  .object({
    id: z.string().min(1).openapi({ example: '64b1f2c3d4e5f6a7b8c9d0e1' }),
    statusId: z.string().min(1).openapi({ example: '64b1f2c3d4e5f6a7b8c9d0e2' }),
  })
  .openapi('ProjectStatusParam');

export const BaseStatusParamSchema = z
  .object({
    id: z.string().min(1).openapi({ example: '64b1f2c3d4e5f6a7b8c9d0e1' }),
    key: z.enum(['pending', 'in_progress', 'review', 'completed']).openapi({ example: 'review' }),
  })
  .openapi('ProjectBaseStatusParam');

export const CreateStatusBodySchema = z
  .object({
    label: z.string().min(1, 'Status name is required').max(40).openapi({ example: 'Production' }),
    color: z.string().optional().openapi({ example: 'blue' }),
  })
  .openapi('CreateProjectStatusBody');

export const UpdateStatusBodySchema = z
  .object({
    label: z.string().min(1).max(40).optional().openapi({ example: 'Released' }),
    color: z.string().optional().openapi({ example: 'emerald' }),
    order: z.number().optional().openapi({ example: 2 }),
  })
  .openapi('UpdateProjectStatusBody');

export const PaginationQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional().openapi({ example: 1 }),
    limit: z.coerce.number().int().positive().optional().openapi({ example: 10 }),
  })
  .openapi('PaginationQuery');

registry.registerPath({
  method: 'post',
  path: '/project/create',
  tags: ['Projects'],
  summary: 'Create a new project',
  security: bearerAuth,
  request: { body: { content: { 'application/json': { schema: CreateProjectBodySchema } } } },
  responses: {
    201: { description: 'Project created' },
    400: { description: 'Validation error' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/project/',
  tags: ['Projects'],
  summary: 'Get all projects (paginated)',
  security: bearerAuth,
  request: { query: PaginationQuerySchema },
  responses: { 200: { description: 'Paginated project list' } },
});

registry.registerPath({
  method: 'get',
  path: '/project/{id}',
  tags: ['Projects'],
  summary: 'Get project by ID',
  security: bearerAuth,
  request: { params: ProjectIdParamSchema },
  responses: {
    200: { description: 'Project found' },
    400: { description: 'Project not found' },
  },
});

registry.registerPath({
  method: 'put',
  path: '/project/{id}',
  tags: ['Projects'],
  summary: 'Update project by ID',
  security: bearerAuth,
  request: {
    params: ProjectIdParamSchema,
    body: { content: { 'application/json': { schema: UpdateProjectBodySchema } } },
  },
  responses: { 200: { description: 'Project updated' } },
});

registry.registerPath({
  method: 'delete',
  path: '/project/{id}',
  tags: ['Projects'],
  summary: 'Delete project by ID',
  security: bearerAuth,
  request: { params: ProjectIdParamSchema },
  responses: {
    200: { description: 'Project deleted' },
    400: { description: 'Project not found' },
  },
});
