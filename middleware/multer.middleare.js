import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../utils/cloudinary.js";

const resumeStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "TMS_uploads/resumes",
    resource_type: "raw",
    allowed_formats: ["pdf", "doc", "docx"],
  },
});

const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "TMS_uploads/profiles",
    resource_type: "image",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
  },
});

const chatFileStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "TMS_uploads/chat",
    resource_type: "auto",
  },
});

const taskFileStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "TMS_uploads/tasks",
    resource_type: "auto",
  },
});

const receiptStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "TMS_uploads/receipts",
    resource_type: "auto",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "pdf"],
  },
});

export const upload = multer({ storage: resumeStorage });
export const uploadImage = multer({ storage: imageStorage });
export const uploadChatFile = multer({
  storage: chatFileStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
});
export const uploadTaskFile = multer({
  storage: taskFileStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
});
export const uploadReceiptFile = multer({
  storage: receiptStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const noteFileStorage = new CloudinaryStorage({
  cloudinary,
  params: async (_req, file) => {
    const isImage = file.mimetype?.startsWith("image/");
    const isVideo = file.mimetype?.startsWith("video/");
    return {
      folder: "TMS_uploads/notes",
      resource_type: isImage ? "image" : isVideo ? "video" : "raw",
      allowed_formats: ["jpg", "jpeg", "png", "webp", "gif", "mp4", "mov", "webm", "pdf", "doc", "docx", "xlsx", "csv"],
    };
  },
});

export const uploadNoteFile = multer({
  storage: noteFileStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
});
