import ScheduledMessage from "../model/scheduledMessage.model.js";
import ChatGroup from "../model/chatGroup.model.js";

// POST /api/v1/chat/scheduled
export const createScheduledMessage = async (req, res) => {
  try {
    const { receiverId, groupId, message, attachments, scheduledAt } = req.body;
    const userId = req.user._id;

    if (!scheduledAt) {
      return res.status(400).json({ success: false, message: "scheduledAt is required" });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime()) || scheduledDate < new Date(Date.now() - 30_000)) {
      return res.status(400).json({ success: false, message: "scheduledAt must be a valid date" });
    }

    if (!receiverId && !groupId) {
      return res.status(400).json({ success: false, message: "receiverId or groupId is required" });
    }

    const hasContent = message?.trim() || (Array.isArray(attachments) && attachments.length > 0);
    if (!hasContent) {
      return res.status(400).json({ success: false, message: "Message or attachment is required" });
    }

    if (groupId) {
      const group = await ChatGroup.findById(groupId).select("members").lean();
      if (!group) return res.status(404).json({ success: false, message: "Group not found" });
      if (!group.members.some((m) => String(m) === String(userId))) {
        return res.status(403).json({ success: false, message: "Not a member of this group" });
      }
    }

    const scheduled = await ScheduledMessage.create({
      sender: userId,
      receiver: receiverId ?? null,
      group: groupId ?? null,
      message: message?.trim() ?? "",
      attachments: Array.isArray(attachments) ? attachments : [],
      scheduledAt: scheduledDate,
    });

    return res.status(201).json({ success: true, data: scheduled });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/v1/chat/scheduled
export const getScheduledMessages = async (req, res) => {
  try {
    const userId = req.user._id;

    const scheduled = await ScheduledMessage.find({ sender: userId })
      .sort({ scheduledAt: 1 })
      .populate("receiver", "name profileImage")
      .populate("group", "name")
      .lean();

    return res.status(200).json({ success: true, data: scheduled });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/v1/chat/scheduled/:id
export const deleteScheduledMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const scheduled = await ScheduledMessage.findById(id);
    if (!scheduled) {
      return res.status(404).json({ success: false, message: "Scheduled message not found" });
    }
    if (String(scheduled.sender) !== String(userId)) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    await ScheduledMessage.findByIdAndDelete(id);

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
