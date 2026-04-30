import Asset from "../model/asset.model.js";
import { resolveOrgAdminId } from "../utils/teamScope.js";

export const createAsset = async (req, res) => {
  try {
    const orgAdminId = resolveOrgAdminId(req.user);
    if (!orgAdminId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const { name, type, serialNumber, notes, conditionOnHandover } = req.body;
    const asset = await Asset.create({
      orgAdmin: orgAdminId,
      name,
      type,
      serialNumber: serialNumber || "",
      notes: notes || "",
      conditionOnHandover: conditionOnHandover || "good",
    });
    return res.status(201).json({ success: true, asset });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getAssets = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role !== "super-admin") {
      const orgAdminId = resolveOrgAdminId(req.user, req.query.orgContext ?? null);
      if (!orgAdminId) {
        return res.status(200).json({ success: true, assets: [] });
      }
      filter = { orgAdmin: orgAdminId };
    }

    const { status, assignedTo } = req.query;
    if (status) filter.status = status;
    if (assignedTo) filter.assignedTo = assignedTo;

    const assets = await Asset.find(filter)
      .populate("assignedTo", "name email profileImage")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, assets });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getAssetById = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id)
      .populate("assignedTo", "name email profileImage")
      .populate("transferHistory.fromUser", "name email")
      .populate("transferHistory.toUser", "name email");

    if (!asset) {
      return res.status(404).json({ success: false, message: "Asset not found" });
    }
    return res.status(200).json({ success: true, asset });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAsset = async (req, res) => {
  try {
    const existing = await Asset.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Asset not found" });
    }

    const orgAdminId = resolveOrgAdminId(req.user);
    if (req.user.role !== "super-admin" && existing.orgAdmin.toString() !== orgAdminId?.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const allowed = ["name", "type", "serialNumber", "notes", "conditionOnHandover", "status", "returnDate"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) existing[key] = req.body[key];
    }
    await existing.save();
    return res.status(200).json({ success: true, asset: existing });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const assignAsset = async (req, res) => {
  try {
    const existing = await Asset.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Asset not found" });
    }

    const orgAdminId = resolveOrgAdminId(req.user);
    if (req.user.role !== "super-admin" && existing.orgAdmin.toString() !== orgAdminId?.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { userId, condition, note } = req.body;

    // Push to history
    existing.transferHistory.push({
      fromUser: existing.assignedTo,
      toUser: userId,
      date: new Date(),
      condition: condition || existing.conditionOnHandover,
      note: note || "",
    });

    existing.assignedTo = userId;
    existing.assignedDate = new Date();
    existing.returnDate = null;
    existing.status = "assigned";
    if (condition) existing.conditionOnHandover = condition;

    await existing.save();
    await existing.populate("assignedTo", "name email profileImage");
    return res.status(200).json({ success: true, asset: existing });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const returnAsset = async (req, res) => {
  try {
    const existing = await Asset.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Asset not found" });
    }

    const orgAdminId = resolveOrgAdminId(req.user);
    if (req.user.role !== "super-admin" && existing.orgAdmin.toString() !== orgAdminId?.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { condition, note } = req.body;

    existing.transferHistory.push({
      fromUser: existing.assignedTo,
      toUser: null,
      date: new Date(),
      condition: condition || existing.conditionOnHandover,
      note: note || "Returned",
    });

    existing.returnDate = new Date();
    existing.assignedTo = null;
    existing.status = "available";
    if (condition) existing.conditionOnHandover = condition;

    await existing.save();
    return res.status(200).json({ success: true, asset: existing });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteAsset = async (req, res) => {
  try {
    const existing = await Asset.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Asset not found" });
    }

    const orgAdminId = resolveOrgAdminId(req.user);
    if (req.user.role !== "super-admin" && existing.orgAdmin.toString() !== orgAdminId?.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    await Asset.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: "Asset deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
