import ChatMessage from "../model/chat.model.js";
import MessageBookmark from "../model/messageBookmark.model.js";
import { reactionPopulate } from "../utils/chatReaction.js";

const replyToPopulate = {
  path: "replyTo",
  select: "_id message attachments sender",
  populate: { path: "sender", select: "name" },
};

// POST /api/v1/chat/message/:messageId/bookmark
export const bookmarkMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { note = "" } = req.body ?? {};
    const userId = req.user._id;

    const message = await ChatMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    await MessageBookmark.findOneAndUpdate(
      { user: userId, message: messageId },
      { user: userId, message: messageId, note: note.trim() },
      { upsert: true, new: true }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({ success: true }); // Already bookmarked
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/v1/chat/message/:messageId/bookmark
export const unbookmarkMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    await MessageBookmark.findOneAndDelete({ user: userId, message: messageId });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/v1/chat/bookmarks
export const getBookmarks = async (req, res) => {
  try {
    const userId = req.user._id;

    const bookmarks = await MessageBookmark.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate({
        path: "message",
        populate: [
          { path: "sender", select: "name profileImage" },
          { path: "receiver", select: "name profileImage" },
          { path: "group", select: "name" },
          reactionPopulate,
          replyToPopulate,
        ],
      })
      .lean();

    const data = bookmarks
      .filter((b) => b.message)
      .map((b) => ({
        _id: b._id,
        note: b.note,
        savedAt: b.createdAt,
        message: b.message,
      }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
