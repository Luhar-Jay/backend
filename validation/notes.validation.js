import { z, registry } from '../swagger/registry.js';

export const bearerAuth = [{ bearerAuth: [] }];

export const StickyColorSchema = z.enum(['lemon', 'mint', 'sky', 'lilac', 'peach', 'paper']);

const TagsSchema = z.array(z.string().min(1).max(30)).max(10).optional();

const ChecklistItemSchema = z.object({
  text: z.string().min(1).max(200),
  checked: z.boolean().default(false),
});

export const CreateNoteBodySchema = z.object({
    title: z.string().min(1, 'Title is required').openapi({ example: 'Note Title' }),
    content: z.string().min(1, 'Content is required').openapi({ example: 'Note Content' }),
    color: StickyColorSchema.optional().openapi({ example: 'lemon' }),
    positionX: z.coerce.number().min(0).max(100).optional(),
    positionY: z.coerce.number().min(0).max(100).optional(),
    tags: TagsSchema,
}).openapi('CreateNoteBody');

export const NoteIdParamSchema = z
    .object({ id: z.string().min(1).openapi({ example: '64b1f2c3d4e5f6a7b8c9d0e1' }) })
    .openapi('NoteIdParam');

export const UpdateNoteBodySchema = z
    .object({
        title: z.string().min(1).optional(),
        content: z.string().min(1).optional(),
        color: StickyColorSchema.optional(),
        positionX: z.coerce.number().min(0).max(100).optional(),
        positionY: z.coerce.number().min(0).max(100).optional(),
        isArchived: z.boolean().optional(),
        isPinned: z.boolean().optional(),
        tags: TagsSchema,
        checklist: z.array(ChecklistItemSchema).max(30).optional(),
    })
    .openapi('UpdateNoteBody');

export const AttachmentIdParamSchema = z.object({
  id: z.string().min(1).openapi({ example: '64b1f2c3d4e5f6a7b8c9d0e1' }),
  attachmentId: z.string().min(1).openapi({ example: '64b1f2c3d4e5f6a7b8c9d0e2' }),
}).openapi('AttachmentIdParam');

export const BulkNotesBodySchema = z.object({
    ids: z.array(z.string().min(1)).min(1).max(100),
    action: z.enum(['archive', 'unarchive', 'delete', 'color']),
    color: StickyColorSchema.optional(),
}).openapi('BulkNotesBody');

registry.registerPath({
    method: 'post',
    path: '/notes/create',
    tags: ['Notes'],
    summary: 'Create a new note',
    security: bearerAuth,
    request: { body: { content: { 'application/json': { schema: CreateNoteBodySchema } } } },
    responses: {
        201: { description: 'Note created' },
        400: { description: 'Validation error' },
    },
});

registry.registerPath({
    method: 'get',
    path: '/notes/search',
    tags: ['Notes'],
    summary: 'Search notes by title, content, or tag',
    security: bearerAuth,
    responses: {
        200: { description: 'Search results' },
    },
});

registry.registerPath({
    method: 'delete',
    path: '/notes/{id}',
    tags: ['Notes'],
    summary: 'Permanently delete a note',
    security: bearerAuth,
    responses: {
        200: { description: 'Note deleted' },
        404: { description: 'Note not found' },
    },
});

registry.registerPath({
    method: 'patch',
    path: '/notes/bulk',
    tags: ['Notes'],
    summary: 'Bulk archive, unarchive, delete, or recolor notes',
    security: bearerAuth,
    request: { body: { content: { 'application/json': { schema: BulkNotesBodySchema } } } },
    responses: {
        200: { description: 'Bulk action completed' },
        400: { description: 'Validation error' },
    },
});
