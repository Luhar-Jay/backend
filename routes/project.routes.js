import express from 'express';
import {
  createProject,
  deleteProject,
  getAllProjects,
  getProjectById,
  updateProject,
} from '../controllers/project.controller.js';
import {
  listProjectStatuses,
  createProjectStatus,
  updateProjectStatus,
  deleteProjectStatus,
  removeBaseStatus,
} from '../controllers/projectStatus.controller.js';
import { authenticateMiddleware } from '../middleware/authenticate.middleware.js';
import { authorize } from '../middleware/authorize.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  CreateProjectBodySchema,
  PaginationQuerySchema,
  ProjectIdParamSchema,
  UpdateProjectBodySchema,
  StatusParamSchema,
  BaseStatusParamSchema,
  CreateStatusBodySchema,
  UpdateStatusBodySchema,
} from '../validation/project.validation.js';

const router = express.Router();

// Custom Kanban statuses (columns) per project
router.get('/:id/statuses', authenticateMiddleware, validate({ params: ProjectIdParamSchema }), listProjectStatuses);
router.post('/:id/statuses', authenticateMiddleware, authorize('super-admin', 'admin', 'manager'), validate({ params: ProjectIdParamSchema, body: CreateStatusBodySchema }), createProjectStatus);
// Remove a base status (more specific path — must precede /:statusId)
router.delete('/:id/statuses/base/:key', authenticateMiddleware, authorize('super-admin', 'admin', 'manager'), validate({ params: BaseStatusParamSchema }), removeBaseStatus);
router.put('/:id/statuses/:statusId', authenticateMiddleware, authorize('super-admin', 'admin', 'manager'), validate({ params: StatusParamSchema, body: UpdateStatusBodySchema }), updateProjectStatus);
router.delete('/:id/statuses/:statusId', authenticateMiddleware, authorize('super-admin', 'admin', 'manager'), validate({ params: StatusParamSchema }), deleteProjectStatus);

router.post('/create', authenticateMiddleware, authorize('super-admin', 'admin', 'manager'), validate({ body: CreateProjectBodySchema }), createProject);
router.get('/', authenticateMiddleware, validate({ query: PaginationQuerySchema }), getAllProjects);
router.get('/:id', authenticateMiddleware, validate({ params: ProjectIdParamSchema }), getProjectById);
router.put('/:id', authenticateMiddleware, authorize('super-admin', 'admin', 'manager'), validate({ params: ProjectIdParamSchema, body: UpdateProjectBodySchema }), updateProject);
router.delete('/:id', authenticateMiddleware, authorize('super-admin', 'admin', 'manager'), validate({ params: ProjectIdParamSchema }), deleteProject);

export default router;
