import ScheduledMessage from "../model/scheduledMessage.model.js";
import ChatMessage from "../model/chat.model.js";
import { reactionPopulate } from "./chatReaction.js";

let ioRef = null;

async function processDueMessages() {
  const now = new Date();
  const due = await ScheduledMessage.find({
    scheduledAt: { $lte: now },
  }).lean();

  if (!due.length) return;

  for (const sm of due) {
    try {
      const chatMessage = await ChatMessage.create({
        sender: sm.sender,
        receiver: sm.receiver,
        group: sm.group,
        message: sm.message,
        attachments: sm.attachments,
      });

      const populated = await chatMessage.populate([
        { path: "sender", select: "name profileImage" },
        { path: "receiver", select: "name profileImage" },
        reactionPopulate,
      ]);

      const msgPlain = populated.toObject();

      if (sm.group) {
        ioRef?.to(`group:${sm.group}`).emit("group:message:receive", {
          groupId: String(sm.group),
          message: msgPlain,
        });
      } else if (sm.receiver) {
        ioRef?.to(String(sm.receiver)).emit("message:receive", msgPlain);
        ioRef?.to(String(sm.sender)).emit("message:receive", msgPlain);
      }

      await ScheduledMessage.findByIdAndDelete(sm._id);
      // Notify sender so the drawer auto-removes it
      ioRef?.to(String(sm.sender)).emit("scheduled:sent", { id: String(sm._id) });
    } catch (err) {
      console.error("Failed to send scheduled message:", sm._id, err.message);
    }
  }
}

export function initChatScheduler(io) {
  ioRef = io;
  // Poll every 10 seconds — much simpler than sub-minute cron expressions
  setInterval(async () => {
    try {
      await processDueMessages();
    } catch (err) {
      console.error("Chat scheduler error:", err.message);
    }
  }, 10_000);
}
