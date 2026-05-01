import Project from "../model/project.model.js";
import User from "../model/user.model.js";
import {
  getOrgCreatorUserIds,
  resolveOrgAdminId,
} from "../utils/teamScope.js";

/**
 * From a list of org member IDs, remove any who own their own org
 * (their projects belong to *their* org, not this one).
 * The orgAdmin themselves is always kept.
 */
async function excludeDualOrgMembers(creatorIds, orgAdminId) {
  const dualOrgIds = await User.find({
    _id: { $in: creatorIds },
    organization: { $exists: true, $ne: null },
  }).distinct("_id");

  const adminStr = orgAdminId.toString();
  const excludeSet = new Set(
    dualOrgIds
      .map((id) => id.toString())
      .filter((s) => s !== adminStr)
  );

  return creatorIds.filter((id) => !excludeSet.has(id.toString()));
}

export const createProject = async (req, res) => {
  const userId = req.user._id;
  try {
    const { projectName, description } = req.body;
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);

    const project = await Project.create({
      projectName,
      description,
      user: userId,
      orgAdmin,
    });
    return res.status(201).json({
      success: true,
      message: "Project created successfully",
      project,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error creating project",
      error: error.message,
    });
  }
};

export const getAllProjects = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let filter = {};
    if (req.user.role !== "super-admin") {
      const orgAdminId = resolveOrgAdminId(req.user, req.query.orgContext ?? null);
      if (!orgAdminId) {
        filter = { _id: { $exists: false } };
      } else {
        // Build legacy user-based fallback for projects without orgAdmin field
        let creatorIds = await getOrgCreatorUserIds(orgAdminId);
        creatorIds = await excludeDualOrgMembers(creatorIds, orgAdminId);
        if (req.query.orgContext === "member") {
          creatorIds = creatorIds.filter(
            (id) => id.toString() !== req.user._id.toString()
          );
        }

        // Primary: projects with explicit orgAdmin (new projects)
        // Fallback: legacy projects without orgAdmin, scoped by user membership
        filter = {
          $or: [
            { orgAdmin: orgAdminId },
            { orgAdmin: null, user: { $in: creatorIds } },
          ],
        };
      }
    }

    const totalProjects = await Project.countDocuments(filter);
    const projects = await Project.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    const totalPages = Math.ceil(totalProjects / limit) || 1;
    return res.status(200).json({
      success: true,
      message: "Projects fetched successfully",
      projects,
      totalProjects,
      totalPages,
      currentPage: page,
      nextPage: page < totalPages ? page + 1 : null,
      previousPage: page > 1 ? page - 1 : null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching projects",
      error: error.message,
    });
  }
};

export const getProjectById = async (req, res) => {
  const ProjectId = req.params.id;
  try {
    const project = await Project.findById(ProjectId);
    if (!project) {
      return res.status(400).json({
        success: false,
        message: "Project not found",
      });
    }

    if (req.user.role !== "super-admin") {
      const orgAdminId = resolveOrgAdminId(req.user, req.query.orgContext ?? null);
      if (!orgAdminId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      // Check orgAdmin field first (new projects), fall back to member check
      const allowed = project.orgAdmin
        ? project.orgAdmin.toString() === orgAdminId.toString()
        : (await getOrgCreatorUserIds(orgAdminId)).some((id) => id.equals(project.user));

      if (!allowed) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Project fetched successfully",
      project,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching project",
      error: error.message,
    });
  }
};

export const updateProject = async (req, res) => {
  const projectId = req.params.id;
  const { projectName, description } = req.body;

  try {
    const existing = await Project.findById(projectId);
    if (!existing) {
      return res.status(400).json({ success: false, message: "Project not found" });
    }

    if (req.user.role !== "super-admin") {
      const orgAdminId = resolveOrgAdminId(req.user, req.query.orgContext ?? null);
      if (!orgAdminId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const allowed = existing.orgAdmin
        ? existing.orgAdmin.toString() === orgAdminId.toString()
        : (await getOrgCreatorUserIds(orgAdminId)).some((id) => id.equals(existing.user));

      if (!allowed) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
    }

    const project = await Project.findByIdAndUpdate(
      projectId,
      { projectName, description },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Project updated successfully",
      project,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error updating project",
      error: error.message,
    });
  }
};

export const deleteProject = async (req, res) => {
  const projectId = req.params.id;

  try {
    const existing = await Project.findById(projectId);
    if (!existing) {
      return res.status(400).json({ success: false, message: "Project not found" });
    }

    if (req.user.role !== "super-admin") {
      const orgAdminId = resolveOrgAdminId(req.user, req.query.orgContext ?? null);
      if (!orgAdminId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const allowed = existing.orgAdmin
        ? existing.orgAdmin.toString() === orgAdminId.toString()
        : (await getOrgCreatorUserIds(orgAdminId)).some((id) => id.equals(existing.user));

      if (!allowed) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
    }

    await Project.findByIdAndDelete(projectId);
    return res.status(200).json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error deleting project",
      error: error.message,
    });
  }
};
