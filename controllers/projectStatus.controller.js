import Project from "../model/project.model.js";
import Task from "../model/tasks.model.js";
import {
  getOrgCreatorUserIds,
  resolveOrgAdminId,
} from "../utils/teamScope.js";
import { BASE_STATUS_KEYS } from "./tasks.controller.js";

/**
 * Verifies the requester may access (and, for writes, manage) this project,
 * mirroring the org-scoping used in project.controller.js. Route-level
 * `authorize(...)` already gates writes by role; this enforces org ownership.
 * Returns true if allowed.
 */
async function canAccessProject(req, project) {
  if (req.user.role === "super-admin") return true;
  const orgAdminId = resolveOrgAdminId(req.user, req.query.orgContext ?? null);
  if (!orgAdminId) return false;
  return project.orgAdmin
    ? project.orgAdmin.toString() === orgAdminId.toString()
    : (await getOrgCreatorUserIds(orgAdminId)).some((id) => id.equals(project.user));
}

/** Slugify a label into a stable status key (lowercase, underscores). */
function slugifyStatus(label) {
  return String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Display labels for the built-in statuses, mirroring the frontend's
// TASK_STATUS_UI map. Used so that re-adding a removed base status by its
// visible name (e.g. "Todo", "Done") restores the right column.
const BASE_STATUS_LABELS = {
  pending: "Todo",
  in_progress: "In Progress",
  review: "Review",
  completed: "Done",
};

/**
 * Resolve a free-text status name to a base status key if it matches one,
 * either by its slugified key (e.g. "in_progress") or by its display label
 * (e.g. "Todo" -> "pending"). Returns null when it's not a base status.
 */
function resolveBaseStatusKey(label) {
  const slug = slugifyStatus(label);
  if (BASE_STATUS_KEYS.includes(slug)) return slug;
  return (
    BASE_STATUS_KEYS.find((k) => slugifyStatus(BASE_STATUS_LABELS[k]) === slug) ??
    null
  );
}

/**
 * Ordered list of the project's currently-visible status keys (base statuses
 * that aren't hidden, in order, then custom statuses by order), optionally
 * excluding one key. Used to pick a fallback when a status is removed.
 */
function orderedVisibleStatusKeys(project, excludeKey = null) {
  const hidden = new Set(project.hiddenBaseStatuses ?? []);
  const base = BASE_STATUS_KEYS.filter((k) => !hidden.has(k));
  const customs = [...project.customStatuses]
    .sort((a, b) => a.order - b.order)
    .map((s) => s.key);
  return [...base, ...customs].filter((k) => k !== excludeKey);
}

export const listProjectStatuses = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).select("customStatuses orgAdmin user");
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }
    if (!(await canAccessProject(req, project))) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const statuses = [...project.customStatuses].sort((a, b) => a.order - b.order);
    return res.status(200).json({
      success: true,
      statuses,
      hiddenBaseStatuses: project.hiddenBaseStatuses ?? [],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching statuses",
      error: error.message,
    });
  }
};

export const createProjectStatus = async (req, res) => {
  try {
    const { label, color } = req.body;
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }
    if (!(await canAccessProject(req, project))) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const key = slugifyStatus(label);
    if (!key) {
      return res.status(400).json({ success: false, message: "Status name is invalid" });
    }

    // The name matches a built-in status (by key or display label). If that
    // base status was previously removed (hidden), re-adding it should restore
    // the column rather than error out. Only a base status that's still visible
    // is truly "reserved".
    const baseKey = resolveBaseStatusKey(label);
    if (baseKey) {
      const hiddenIndex = (project.hiddenBaseStatuses ?? []).indexOf(baseKey);
      if (hiddenIndex === -1) {
        return res.status(400).json({ success: false, message: "That status name is reserved" });
      }
      project.hiddenBaseStatuses.splice(hiddenIndex, 1);
      await project.save();
      return res.status(200).json({ success: true, message: "Status restored", baseStatusKey: baseKey });
    }

    if (project.customStatuses.some((s) => s.key === key)) {
      return res.status(409).json({ success: false, message: "A status with that name already exists" });
    }

    const maxOrder = project.customStatuses.reduce((m, s) => Math.max(m, s.order), 0);
    project.customStatuses.push({ key, label: label.trim(), color: color || "slate", order: maxOrder + 1 });
    await project.save();

    const created = project.customStatuses.find((s) => s.key === key);
    return res.status(201).json({ success: true, message: "Status created", status: created });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error creating status",
      error: error.message,
    });
  }
};

export const updateProjectStatus = async (req, res) => {
  try {
    const { label, color, order } = req.body;
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }
    if (!(await canAccessProject(req, project))) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const status = project.customStatuses.id(req.params.statusId);
    if (!status) {
      return res.status(404).json({ success: false, message: "Status not found" });
    }

    // key stays immutable so existing tasks keep their column
    if (label !== undefined) status.label = String(label).trim();
    if (color !== undefined) status.color = color;
    if (order !== undefined) status.order = order;
    await project.save();

    return res.status(200).json({ success: true, message: "Status updated", status });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error updating status",
      error: error.message,
    });
  }
};

export const deleteProjectStatus = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }
    if (!(await canAccessProject(req, project))) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const status = project.customStatuses.id(req.params.statusId);
    if (!status) {
      return res.status(404).json({ success: false, message: "Status not found" });
    }

    // Move tasks in this status to the first remaining status (prefer "Todo").
    const fallback = orderedVisibleStatusKeys(project, status.key)[0];
    if (!fallback) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete the only remaining status",
      });
    }
    await Task.updateMany(
      { project: project._id, status: status.key },
      { status: fallback }
    );

    status.deleteOne();
    await project.save();

    return res.status(200).json({ success: true, message: "Status deleted" });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error deleting status",
      error: error.message,
    });
  }
};

export const removeBaseStatus = async (req, res) => {
  try {
    const { key } = req.params;
    if (!BASE_STATUS_KEYS.includes(key)) {
      return res.status(400).json({ success: false, message: "Not a base status" });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }
    if (!(await canAccessProject(req, project))) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if ((project.hiddenBaseStatuses ?? []).includes(key)) {
      return res.status(200).json({ success: true, message: "Status already removed" });
    }

    // Move tasks in this status to the first remaining status, and refuse to
    // remove the last column.
    const fallback = orderedVisibleStatusKeys(project, key)[0];
    if (!fallback) {
      return res.status(400).json({
        success: false,
        message: "Cannot remove the only remaining status",
      });
    }
    await Task.updateMany(
      { project: project._id, status: key },
      { status: fallback }
    );

    project.hiddenBaseStatuses.push(key);
    await project.save();

    return res.status(200).json({ success: true, message: "Status removed" });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error removing status",
      error: error.message,
    });
  }
};
