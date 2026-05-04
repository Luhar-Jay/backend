import { Router } from "express";
import { authenticateMiddleware } from "../middleware/authenticate.middleware.js";
import {
  getChatUsers,
  getMessages,
  getOnlineUsersList,
  deleteMessage,
  editMessage,
  clearChat,
  uploadChatFileController,
  toggleReaction,
} from "../controllers/chat.controller.js";
import {
  createGroup,
  getGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
  getGroupMessages,
  clearGroupChat,
  leaveGroup,
} from "../controllers/chatGroup.controller.js";
import { uploadChatFile } from "../middleware/multer.middleare.js";

const router = Router();

router.use(authenticateMiddleware);

// DM routes
router.get("/users", getChatUsers);
router.get("/online", getOnlineUsersList);
router.post("/upload", uploadChatFile.single("file"), uploadChatFileController);
router.patch("/message/:messageId", editMessage);
router.delete("/message/:messageId", deleteMessage);
router.post("/message/:messageId/reaction", toggleReaction);
router.delete("/clear/:otherUserId", clearChat);

// Group routes
router.post("/groups", createGroup);
router.get("/groups", getGroups);
router.get("/groups/:groupId", getGroupById);
router.patch("/groups/:groupId", updateGroup);
router.delete("/groups/:groupId", deleteGroup);
router.get("/groups/:groupId/messages", getGroupMessages);
router.delete("/groups/:groupId/clear", clearGroupChat);
router.post("/groups/:groupId/leave", leaveGroup);

// Must be last — catches /:receiverId for DM history
router.get("/:receiverId", getMessages);

export default router;
