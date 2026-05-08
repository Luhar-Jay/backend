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
  forwardMessage,
  markGroupMessagesRead,
  getReadBy,
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
import {
  pinMessage,
  unpinMessage,
  getDmPinnedMessages,
  getGroupPinnedMessages,
} from "../controllers/chatPin.controller.js";
import {
  bookmarkMessage,
  unbookmarkMessage,
  getBookmarks,
} from "../controllers/chatBookmark.controller.js";
import { searchMessages } from "../controllers/chatSearch.controller.js";
import { exportDmChat, exportGroupChat } from "../controllers/chatExport.controller.js";
import { searchGifs, trendingGifs } from "../controllers/chatGif.controller.js";
import {
  createScheduledMessage,
  getScheduledMessages,
  deleteScheduledMessage,
} from "../controllers/chatScheduled.controller.js";
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
router.post("/message/:messageId/forward", forwardMessage);
router.post("/message/:messageId/pin", pinMessage);
router.delete("/message/:messageId/pin", unpinMessage);
router.post("/message/:messageId/bookmark", bookmarkMessage);
router.delete("/message/:messageId/bookmark", unbookmarkMessage);
router.get("/message/:messageId/read-by", getReadBy);
router.delete("/clear/:otherUserId", clearChat);

// Bookmarks
router.get("/bookmarks", getBookmarks);

// Search
router.get("/search", searchMessages);

// GIFs
router.get("/gifs/trending", trendingGifs);
router.get("/gifs", searchGifs);

// Scheduled messages
router.post("/scheduled", createScheduledMessage);
router.get("/scheduled", getScheduledMessages);
router.delete("/scheduled/:id", deleteScheduledMessage);

// Group routes
router.post("/groups", createGroup);
router.get("/groups", getGroups);
router.get("/groups/:groupId", getGroupById);
router.patch("/groups/:groupId", updateGroup);
router.delete("/groups/:groupId", deleteGroup);
router.get("/groups/:groupId/messages", getGroupMessages);
router.post("/groups/:groupId/messages/read", markGroupMessagesRead);
router.delete("/groups/:groupId/clear", clearGroupChat);
router.post("/groups/:groupId/leave", leaveGroup);
router.get("/groups/:groupId/pinned", getGroupPinnedMessages);
router.get("/groups/:groupId/export", exportGroupChat);

// Must be last — catches /:receiverId for DM history and DM-specific sub-routes
router.get("/:receiverId/pinned", getDmPinnedMessages);
router.get("/:receiverId/export", exportDmChat);
router.get("/:receiverId", getMessages);

export default router;
