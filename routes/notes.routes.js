import express from "express";
import { authenticateMiddleware } from "../middleware/authenticate.middleware.js";
import {
  bulkNotes,
  createNote,
  deleteNote,
  deleteNoteAttachment,
  getMyNotes,
  searchNotes,
  updateNote,
  uploadNoteAttachment,
} from "../controllers/notes.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { uploadNoteFile } from "../middleware/multer.middleare.js";
import {
  AttachmentIdParamSchema,
  BulkNotesBodySchema,
  CreateNoteBodySchema,
  NoteIdParamSchema,
  UpdateNoteBodySchema,
} from "../validation/notes.validation.js";

const router = express.Router();

router.get("/", authenticateMiddleware, getMyNotes);
router.get("/search", authenticateMiddleware, searchNotes);

router.post(
  "/create",
  authenticateMiddleware,
  validate({ body: CreateNoteBodySchema }),
  createNote
);

router.patch(
  "/bulk",
  authenticateMiddleware,
  validate({ body: BulkNotesBodySchema }),
  bulkNotes
);

router.post(
  "/:id/attachments",
  authenticateMiddleware,
  uploadNoteFile.single("file"),
  uploadNoteAttachment
);

router.delete(
  "/:id/attachments/:attachmentId",
  authenticateMiddleware,
  validate({ params: AttachmentIdParamSchema }),
  deleteNoteAttachment
);

router.patch(
  "/:id",
  authenticateMiddleware,
  validate({ params: NoteIdParamSchema, body: UpdateNoteBodySchema }),
  updateNote
);

router.delete(
  "/:id",
  authenticateMiddleware,
  validate({ params: NoteIdParamSchema }),
  deleteNote
);

export default router;
