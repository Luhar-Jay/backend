import ChatMessage from "../model/chat.model.js";
import PinnedMessage from "../model/pinnedMessage.model.js";
import { reactionPopulate } from "../utils/chatReaction.js";

const MAX_PINS = 5;

const replyToPopulate = {
  path: "replyTo",
  select: "_id message attachments sender",
  populate: { path: "sender", select: "name" },
};

function getDmUsers(userId1, userId2) {
  const ids = [String(userId1), String(userId2)].sort();
  return { dmUser1: ids[0], dmUser2: ids[1] };
}

// POST /api/v1/chat/message/:messageId/pin
export const pinMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await ChatMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    let pinQuery;
    let pinData;

    if (message.group) {
      pinQuery = { group: message.group };
      pinData = { group: message.group };
    } else {
      const { dmUser1, dmUser2 } = getDmUsers(message.sender, message.receiver);
      pinQuery = { dmUser1, dmUser2 };
      pinData = { dmUser1, dmUser2 };
    }

    // Enforce max pins limit
    const count = await PinnedMessage.countDocuments(pinQuery);
    if (count >= MAX_PINS) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_PINS} pins allowed per conversation`,
      });
    }

    // Upsert — silently succeeds if already pinned
    await PinnedMessage.findOneAndUpdate(
      { message: messageId, ...pinQuery },
      { message: messageId, pinnedBy: userId, ...pinData },
      { upsert: true, new: true }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({ success: true }); // Already pinned
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/v1/chat/message/:messageId/pin
export const unpinMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await ChatMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    let pinQuery;
    if (message.group) {
      pinQuery = { group: message.group, message: messageId };
    } else {
      const { dmUser1, dmUser2 } = getDmUsers(message.sender, message.receiver);
      pinQuery = { dmUser1, dmUser2, message: messageId };
    }

    await PinnedMessage.findOneAndDelete(pinQuery);

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/v1/chat/:receiverId/pinned
export const getDmPinnedMessages = async (req, res) => {
  try {
    const { receiverId } = req.params;
    const userId = req.user._id;
    const { dmUser1, dmUser2 } = getDmUsers(userId, receiverId);

    const pins = await PinnedMessage.find({ dmUser1, dmUser2 })
      .sort({ createdAt: -1 })
      .populate({
        path: "message",
        populate: [
          { path: "sender", select: "name profileImage" },
          reactionPopulate,
          replyToPopulate,
        ],
      })
      .populate("pinnedBy", "name profileImage")
      .lean();

    const data = pins
      .filter((p) => p.message)
      .map((p) => ({ ...p.message, pinnedAt: p.createdAt, pinnedBy: p.pinnedBy }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/v1/chat/groups/:groupId/pinned
export const getGroupPinnedMessages = async (req, res) => {
  try {
    const { groupId } = req.params;

    const pins = await PinnedMessage.find({ group: groupId })
      .sort({ createdAt: -1 })
      .populate({
        path: "message",
        populate: [
          { path: "sender", select: "name profileImage" },
          reactionPopulate,
          replyToPopulate,
        ],
      })
      .populate("pinnedBy", "name profileImage")
      .lean();

    const data = pins
      .filter((p) => p.message)
      .map((p) => ({ ...p.message, pinnedAt: p.createdAt, pinnedBy: p.pinnedBy }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
