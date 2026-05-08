import PDFDocument from "pdfkit";
import ChatMessage from "../model/chat.model.js";
import User from "../model/user.model.js";
import ChatGroup from "../model/chatGroup.model.js";

function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchAllMessages(filter) {
  return ChatMessage.find(filter)
    .sort({ createdAt: 1 })
    .populate("sender", "name")
    .lean();
}

function buildPdf(doc, title, subtitle, messages) {
  // Header
  doc.fontSize(18).font("Helvetica-Bold").text(title, { align: "center" });
  doc.fontSize(10).font("Helvetica").fillColor("#666").text(subtitle, { align: "center" });
  doc.moveDown(1.5);
  doc.moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor("#ccc")
    .stroke();
  doc.moveDown(1);

  // Messages
  for (const msg of messages) {
    const senderName = msg.sender?.name ?? "Unknown";
    const timestamp = formatDateTime(msg.createdAt);
    const hasText = msg.message?.trim();
    const hasAttachments = msg.attachments?.length > 0;

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#5b21b6").text(senderName, { continued: true });
    doc.font("Helvetica").fillColor("#999").text(`  ${timestamp}`);

    if (hasText) {
      doc.fontSize(10).font("Helvetica").fillColor("#111").text(msg.message.trim(), {
        lineGap: 2,
      });
    }

    if (hasAttachments) {
      for (const att of msg.attachments) {
        doc.fontSize(9).fillColor("#2563eb").text(`📎 ${att.name} (${att.mimeType})`);
      }
    }

    if (msg.isForwarded) {
      doc.fontSize(8).fillColor("#888").text("↩ Forwarded");
    }

    doc.moveDown(0.6);
  }
}

// GET /api/v1/chat/:receiverId/export
export const exportDmChat = async (req, res) => {
  try {
    const { receiverId } = req.params;
    const userId = req.user._id;

    const [currentUser, otherUser] = await Promise.all([
      User.findById(userId).select("name").lean(),
      User.findById(receiverId).select("name").lean(),
    ]);

    if (!otherUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const messages = await fetchAllMessages({
      $or: [
        { sender: userId, receiver: receiverId },
        { sender: receiverId, receiver: userId },
      ],
      deletedFor: { $nin: [userId] },
    });

    const title = `Chat: ${currentUser?.name ?? "You"} & ${otherUser.name}`;
    const subtitle = `Exported on ${formatDateTime(new Date().toISOString())} · ${messages.length} messages`;

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="chat-${otherUser.name.replace(/\s+/g, "_")}.pdf"`
    );
    doc.pipe(res);
    buildPdf(doc, title, subtitle, messages);
    doc.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

// GET /api/v1/chat/groups/:groupId/export
export const exportGroupChat = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await ChatGroup.findById(groupId).select("name members").lean();
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }
    if (!group.members.some((m) => String(m) === String(userId))) {
      return res.status(403).json({ success: false, message: "Not a member of this group" });
    }

    const messages = await fetchAllMessages({
      group: groupId,
      deletedFor: { $nin: [userId] },
    });

    const title = `Group Chat: ${group.name}`;
    const subtitle = `Exported on ${formatDateTime(new Date().toISOString())} · ${messages.length} messages`;

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="group-${group.name.replace(/\s+/g, "_")}.pdf"`
    );
    doc.pipe(res);
    buildPdf(doc, title, subtitle, messages);
    doc.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};
