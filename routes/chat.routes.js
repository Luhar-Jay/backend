import { Router } from "express";
import { authenticateMiddleware } from "../middleware/authenticate.middleware.js";
import { getChatUsers, getMessages, getOnlineUsersList, deleteMessage, editMessage, clearChat, uploadChatFileController } from "../controllers/chat.controller.js";
import { uploadChatFile } from "../middleware/multer.middleare.js";

const router = Router();

router.use(authenticateMiddleware);

router.get("/users", getChatUsers);
router.get("/online", getOnlineUsersList);
router.post("/upload", uploadChatFile.single("file"), uploadChatFileController);
router.patch("/message/:messageId", editMessage);
router.delete("/message/:messageId", deleteMessage);
router.delete("/clear/:otherUserId", clearChat);
router.get("/:receiverId", getMessages);

export default router;
