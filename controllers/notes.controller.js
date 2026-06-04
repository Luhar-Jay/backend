import Notes from "../model/notes.model.js";
import cloudinary from "../utils/cloudinary.js";

const NOTE_COLORS = new Set(["lemon", "mint", "sky", "lilac", "peach", "paper"]);

function clampPct(n, fallback) {
  const x = Number(n);
  if (Number.isNaN(x)) return fallback;
  return Math.min(100, Math.max(0, x));
}

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(
    tags.map((t) => String(t).trim().toLowerCase()).filter((t) => t.length > 0 && t.length <= 30)
  )].slice(0, 10);
}

export const getMyNotes = async (req, res) => {
  try {
    const userId = req.user._id;
    const wantArchived = req.query.archived === "true";
    const notes = await Notes.find({ user: userId, isArchived: wantArchived })
      .sort({ isPinned: -1, updatedAt: -1 })
      .lean();
    return res.status(200).json({ success: true, message: "Notes fetched successfully", notes });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error fetching notes", error: error.message });
  }
};

export const searchNotes = async (req, res) => {
  try {
    const userId = req.user._id;
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.status(200).json({ success: true, message: "No query", notes: [] });
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "i");
    const notes = await Notes.find({
      user: userId,
      isArchived: false,
      $or: [{ title: re }, { content: re }, { tags: re }],
    })
      .sort({ isPinned: -1, updatedAt: -1 })
      .lean();
    return res.status(200).json({ success: true, message: "Search results", notes });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error searching notes", error: error.message });
  }
};

export const createNote = async (req, res) => {
  try {
    const { title, content, color, positionX, positionY, tags } = req.body;
    const userId = req.user._id;
    const c = NOTE_COLORS.has(color) ? color : "lemon";
    const px = positionX !== undefined ? clampPct(positionX, 12) : 8 + Math.random() * 35;
    const py = positionY !== undefined ? clampPct(positionY, 12) : 8 + Math.random() * 28;
    const note = await Notes.create({
      user: userId,
      title,
      content,
      color: c,
      positionX: px,
      positionY: py,
      tags: sanitizeTags(tags),
    });
    return res.status(201).json({ success: true, message: "Note created successfully", note });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error creating note", error: error.message });
  }
};

export const updateNote = async (req, res) => {
  try {
    const userId = req.user._id;
    const note = await Notes.findOne({ _id: req.params.id, user: userId });
    if (!note) {
      return res.status(404).json({ success: false, message: "Note not found" });
    }

    const { title, content, color, positionX, positionY, isArchived, isPinned, tags } = req.body;

    if (title !== undefined) note.title = String(title);
    if (content !== undefined) note.content = String(content);
    if (color !== undefined && NOTE_COLORS.has(color)) note.color = color;
    if (positionX !== undefined) note.positionX = clampPct(positionX, note.positionX);
    if (positionY !== undefined) note.positionY = clampPct(positionY, note.positionY);
    if (typeof isArchived === "boolean") note.isArchived = isArchived;
    if (typeof isPinned === "boolean") note.isPinned = isPinned;
    if (tags !== undefined) note.tags = sanitizeTags(tags);
    if (Array.isArray(req.body.checklist)) {
      note.checklist = req.body.checklist
        .map((item) => ({ text: String(item.text ?? "").trim().slice(0, 200), checked: Boolean(item.checked) }))
        .filter((item) => item.text.length > 0)
        .slice(0, 30);
    }

    await note.save();
    return res.status(200).json({ success: true, message: "Note updated successfully", note });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error updating note", error: error.message });
  }
};

export const deleteNote = async (req, res) => {
  try {
    const userId = req.user._id;
    const note = await Notes.findOneAndDelete({ _id: req.params.id, user: userId });
    if (!note) {
      return res.status(404).json({ success: false, message: "Note not found" });
    }
    return res.status(200).json({ success: true, message: "Note deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error deleting note", error: error.message });
  }
};

export const uploadNoteAttachment = async (req, res) => {
  try {
    const userId = req.user._id;
    const note = await Notes.findOne({ _id: req.params.id, user: userId });
    if (!note) return res.status(404).json({ success: false, message: "Note not found" });
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    if (note.attachments.length >= 10)
      return res.status(400).json({ success: false, message: "Max 10 attachments per note" });

    note.attachments.push({
      url: req.file.path,
      publicId: req.file.filename,
      name: req.file.originalname,
      mimeType: req.file.mimetype ?? "",
      size: req.file.size ?? 0,
    });
    await note.save();
    return res.status(200).json({ success: true, message: "Attachment uploaded", note });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error uploading attachment", error: error.message });
  }
};

export const deleteNoteAttachment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id, attachmentId } = req.params;
    const note = await Notes.findOne({ _id: id, user: userId });
    if (!note) return res.status(404).json({ success: false, message: "Note not found" });

    const att = note.attachments.id(attachmentId);
    if (!att) return res.status(404).json({ success: false, message: "Attachment not found" });

    try { await cloudinary.uploader.destroy(att.publicId, { resource_type: "auto" }); } catch { /* ignore */ }

    att.deleteOne();
    await note.save();
    return res.status(200).json({ success: true, message: "Attachment deleted", note });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error deleting attachment", error: error.message });
  }
};

export const bulkNotes = async (req, res) => {
  try {
    const userId = req.user._id;
    const { ids, action, color } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "ids array is required" });
    }

    let affected = 0;
    switch (action) {
      case "archive": {
        const r = await Notes.updateMany({ _id: { $in: ids }, user: userId }, { isArchived: true });
        affected = r.modifiedCount;
        break;
      }
      case "unarchive": {
        const r = await Notes.updateMany({ _id: { $in: ids }, user: userId }, { isArchived: false });
        affected = r.modifiedCount;
        break;
      }
      case "delete": {
        const r = await Notes.deleteMany({ _id: { $in: ids }, user: userId });
        affected = r.deletedCount;
        break;
      }
      case "color": {
        if (!NOTE_COLORS.has(color)) {
          return res.status(400).json({ success: false, message: "Invalid color" });
        }
        const r = await Notes.updateMany({ _id: { $in: ids }, user: userId }, { color });
        affected = r.modifiedCount;
        break;
      }
      default:
        return res.status(400).json({ success: false, message: "Invalid action" });
    }

    return res.status(200).json({ success: true, message: "Bulk action completed", affected });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error performing bulk action", error: error.message });
  }
};
