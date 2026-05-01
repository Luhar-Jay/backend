import TimesheetEntry from "../model/timesheet.model.js";
import { resolveOrgAdminId, getOrgCreatorUserIds, getEffectiveRole } from "../utils/teamScope.js";

export const logTime = async (req, res) => {
  try {
    const { task, project, date, hours, description, billable } = req.body;
    const entry = await TimesheetEntry.create({
      user: req.user._id,
      task: task || null,
      project,
      date: new Date(date),
      hours,
      description: description || "",
      billable: billable !== undefined ? billable : true,
    });
    await entry.populate("project", "projectName");
    await entry.populate("task", "taskName");
    return res.status(201).json({ success: true, entry });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getTimesheets = async (req, res) => {
  try {
    const { week, year, userId: queryUserId, project, billable, orgContext } = req.query;
    const effectiveRole = getEffectiveRole(req.user, orgContext ?? null);

    let filter = {};

    // Scope by org
    if (effectiveRole === "super-admin") {
      if (queryUserId) filter.user = queryUserId;
    } else {
      const orgAdminId = resolveOrgAdminId(req.user, orgContext ?? null);
      if (!orgAdminId) return res.status(200).json({ success: true, entries: [] });

      const canViewAll = ["admin", "hr", "manager"].includes(effectiveRole);
      if (canViewAll && queryUserId) {
        // Verify target user is in org
        const creatorIds = await getOrgCreatorUserIds(orgAdminId);
        const allowed = creatorIds.some((id) => id.toString() === queryUserId);
        if (!allowed) {
          return res.status(403).json({ success: false, message: "Access denied" });
        }
        filter.user = queryUserId;
      } else if (!canViewAll) {
        // Employees only see own
        filter.user = req.user._id;
      } else if (canViewAll) {
        // Show all org users
        const creatorIds = await getOrgCreatorUserIds(orgAdminId);
        filter.user = { $in: creatorIds };
      }
    }

    if (week) filter.weekNumber = parseInt(week);
    if (year) filter.year = parseInt(year);
    if (project) filter.project = project;
    if (billable !== undefined) filter.billable = billable === "true";

    const entries = await TimesheetEntry.find(filter)
      .populate("user", "name email profileImage")
      .populate("project", "projectName")
      .populate("task", "taskName")
      .sort({ date: -1, createdAt: -1 });

    // Aggregate totals
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    const billableHours = entries.filter((e) => e.billable).reduce((sum, e) => sum + e.hours, 0);
    const nonBillableHours = totalHours - billableHours;

    return res.status(200).json({
      success: true,
      entries,
      summary: { totalHours, billableHours, nonBillableHours },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateTimesheetEntry = async (req, res) => {
  try {
    const existing = await TimesheetEntry.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Entry not found" });
    }

    const orgContext = req.query.orgContext ?? null;
    const effectiveRole = getEffectiveRole(req.user, orgContext);
    const isOwner = existing.user.toString() === req.user._id.toString();
    const canManage = ["admin", "hr", "super-admin"].includes(effectiveRole);
    if (!isOwner && !canManage) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const allowed = ["hours", "description", "billable", "date", "task", "project"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) existing[key] = req.body[key];
    }
    await existing.save();
    await existing.populate("project", "projectName");
    await existing.populate("task", "taskName");
    return res.status(200).json({ success: true, entry: existing });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteTimesheetEntry = async (req, res) => {
  try {
    const existing = await TimesheetEntry.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Entry not found" });
    }

    const orgContext = req.query.orgContext ?? null;
    const effectiveRole = getEffectiveRole(req.user, orgContext);
    const isOwner = existing.user.toString() === req.user._id.toString();
    const canManage = ["admin", "hr", "super-admin"].includes(effectiveRole);
    if (!isOwner && !canManage) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    await TimesheetEntry.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: "Entry deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const exportTimesheetCsv = async (req, res) => {
  try {
    const { week, year, userId: queryUserId, project, orgContext } = req.query;
    const effectiveRole = getEffectiveRole(req.user, orgContext ?? null);
    let filter = {};

    if (effectiveRole !== "super-admin") {
      const orgAdminId = resolveOrgAdminId(req.user, orgContext ?? null);
      if (!orgAdminId) return res.status(200).send("No data");
      const canViewAll = ["admin", "hr", "manager"].includes(effectiveRole);
      if (canViewAll && queryUserId) {
        filter.user = queryUserId;
      } else if (!canViewAll) {
        filter.user = req.user._id;
      } else {
        const creatorIds = await getOrgCreatorUserIds(orgAdminId);
        filter.user = { $in: creatorIds };
      }
    } else if (queryUserId) {
      filter.user = queryUserId;
    }

    if (week) filter.weekNumber = parseInt(week);
    if (year) filter.year = parseInt(year);
    if (project) filter.project = project;

    const entries = await TimesheetEntry.find(filter)
      .populate("user", "name email")
      .populate("project", "projectName")
      .populate("task", "taskName")
      .sort({ date: 1 });

    const rows = [
      ["Date", "Employee", "Project", "Task", "Hours", "Billable", "Description"],
      ...entries.map((e) => [
        new Date(e.date).toLocaleDateString(),
        e.user?.name || "",
        e.project?.projectName || "",
        e.task?.taskName || "",
        e.hours,
        e.billable ? "Yes" : "No",
        `"${(e.description || "").replace(/"/g, '""')}"`,
      ]),
    ];

    const csv = rows.map((r) => r.join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="timesheet.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
