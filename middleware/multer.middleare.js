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

export const upload = multer({ storage: resumeStorage });
export const uploadImage = multer({ storage: imageStorage });
export const uploadChatFile = multer({
  storage: chatFileStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});
