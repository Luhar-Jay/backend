import Announcement from "../model/announcement.model.js";
import { resolveOrgAdminId, getOrgCreatorUserIds } from "../utils/teamScope.js";

export const createAnnouncement = async (req, res) => {
  try {
    const orgAdminId = resolveOrgAdminId(req.user);
    if (!orgAdminId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const { title, content, isPinned } = req.body;
    const announcement = await Announcement.create({
      orgAdmin: orgAdminId,
      postedBy: req.user._id,
      title,
      content,
      isPinned: isPinned ?? false,
    });
    return res.status(201).json({ success: true, announcement });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getAnnouncements = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === "super-admin") {
      // super-admin sees all
    } else {
      const orgAdminId = resolveOrgAdminId(req.user, req.query.orgContext ?? null);
      if (!orgAdminId) {
        return res.status(200).json({ success: true, announcements: [] });
      }
      filter = { orgAdmin: orgAdminId };
    }

    const announcements = await Announcement.find(filter)
      .populate("postedBy", "name profileImage")
      .sort({ isPinned: -1, createdAt: -1 });

    // Attach read status for each announcement
    const userId = req.user._id.toString();
    const result = announcements.map((a) => {
      const obj = a.toObject();
      obj.isRead = a.readBy.some((id) => id.toString() === userId);
      return obj;
    });

    return res.status(200).json({ success: true, announcements: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    await Announcement.findByIdAndUpdate(
      id,
      { $addToSet: { readBy: userId } },
      { new: true }
    );
    return res.status(200).json({ success: true, message: "Marked as read" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const pinAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const { isPinned } = req.body;

    const existing = await Announcement.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Announcement not found" });
    }

    const orgAdminId = resolveOrgAdminId(req.user);
    if (req.user.role !== "super-admin" && existing.orgAdmin.toString() !== orgAdminId?.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    existing.isPinned = isPinned;
    await existing.save();
    return res.status(200).json({ success: true, announcement: existing });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Announcement.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Announcement not found" });
    }

    const orgAdminId = resolveOrgAdminId(req.user);
    if (req.user.role !== "super-admin" && existing.orgAdmin.toString() !== orgAdminId?.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    await Announcement.findByIdAndDelete(id);
    return res.status(200).json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Announcement.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Announcement not found" });
    }

    const orgAdminId = resolveOrgAdminId(req.user);
    if (req.user.role !== "super-admin" && existing.orgAdmin.toString() !== orgAdminId?.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { title, content, isPinned } = req.body;
    if (title !== undefined) existing.title = title;
    if (content !== undefined) existing.content = content;
    if (isPinned !== undefined) existing.isPinned = isPinned;
    await existing.save();

    return res.status(200).json({ success: true, announcement: existing });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
