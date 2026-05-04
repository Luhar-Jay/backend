import Attendance from "../model/attendence.model.js";
import { calculateWorkingTime } from "../utils/calculateWorkingTime.js";
import { formatDuration } from "../utils/timeFormatter.js";
import { getOrgCreatorUserIds, resolveOrgAdminId } from "../utils/teamScope.js";
import { isHolidayDate } from "./holiday.controller.js";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const MAX_ATTENDANCE_RANGE_DAYS = 62;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function computeDayWorkedMs(attendance) {
  const base = attendance.dayTotalMs || 0;
  if (!attendance.punchInTime) return base;
  if (attendance.status !== "working" && attendance.status !== "on_break") return base;
  return base + calculateWorkingTime(attendance);
}

function enrichAttendance(att) {
  const doc = att.toObject ? att.toObject() : { ...att };
  const dayMs = computeDayWorkedMs(att);
  return {
    ...doc,
    readableDayTotal: formatDuration(dayMs),
    dayWorkedMs: dayMs,
  };
}

function copyBreaks(breaks) {
  return (breaks || []).map((b) => ({
    breakStart: b.breakStart,
    breakEnd: b.breakEnd,
    totalBreakTime: b.totalBreakTime,
  }));
}

function parseLocalDateQuery(dateParam) {
  if (dateParam === undefined || dateParam === null || String(dateParam).trim() === "") return null;
  const s = String(dateParam).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const day = new Date(y, mo, d);
  day.setHours(0, 0, 0, 0);
  if (day.getFullYear() !== y || day.getMonth() !== mo || day.getDate() !== d) return false;
  return day;
}

// ─── Core Punch Operations ────────────────────────────────────────────────────

export const punchIn = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = startOfToday();

    const orgAdminId = resolveOrgAdminId(req.user);
    const holidayName = await isHolidayDate(orgAdminId, today);
    if (holidayName) {
      return res.status(400).json({
        success: false,
        message: `Today is ${holidayName} — a company holiday. Enjoy your day off!`,
      });
    }

    let record = await Attendance.findOne({ user: userId, date: today });

    if (record?.punchInTime && (record.status === "working" || record.status === "on_break")) {
      return res.status(400).json({
        success: false,
        message: "You are already clocked in. Punch out first.",
      });
    }

    if (!record) {
      record = await Attendance.create({
        user: userId,
        date: today,
        punchInTime: new Date(),
        status: "working",
        breaks: [],
        segments: [],
        dayTotalMs: 0,
      });
    } else {
      // Migrate legacy single-session data when punching in again after punch-out
      if (
        !record.legacySegmentsMigrated &&
        record.status === "completed" &&
        record.punchInTime &&
        record.punchOutTime &&
        (!record.segments || record.segments.length === 0)
      ) {
        const legacyMs = calculateWorkingTime(record);
        record.segments = [
          {
            punchInTime: record.punchInTime,
            punchOutTime: record.punchOutTime,
            breaks: copyBreaks(record.breaks),
            totalTime: legacyMs,
          },
        ];
        record.dayTotalMs = (record.dayTotalMs || 0) + legacyMs;
        record.legacySegmentsMigrated = true;
      }

      record.punchInTime = new Date();
      record.punchOutTime = null;
      record.breaks = [];
      record.status = "working";
      await record.save();
    }

    return res.status(200).json({
      success: true,
      message: "Punched in successfully",
      attendance: enrichAttendance(record),
    });
  } catch (error) {
    console.error("❌ Error punching in:", error);
    return res.status(500).json({ success: false, message: "Error punching in", error: error.message });
  }
};

export const startBreak = async (req, res) => {
  try {
    const today = startOfToday();
    const attendance = await Attendance.findOne({ user: req.user._id, date: today });

    if (!attendance?.punchInTime) {
      return res.status(400).json({ success: false, message: "You haven't punched in yet" });
    }
    if (attendance.status === "on_break") {
      return res.status(400).json({ success: false, message: "You are already on a break." });
    }

    attendance.breaks.push({ breakStart: new Date() });
    attendance.status = "on_break";
    await attendance.save();

    return res.status(200).json({
      success: true,
      message: "Break started successfully",
      attendance: enrichAttendance(attendance),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error starting break", error: error.message });
  }
};

export const endBreak = async (req, res) => {
  try {
    const today = startOfToday();
    const attendance = await Attendance.findOne({ user: req.user._id, date: today });

    if (!attendance?.punchInTime || attendance.status !== "on_break") {
      return res.status(400).json({ success: false, message: "You haven't started a break yet" });
    }

    const currentBreak = attendance.breaks[attendance.breaks.length - 1];
    currentBreak.breakEnd = new Date();
    currentBreak.totalBreakTime = currentBreak.breakEnd - currentBreak.breakStart;
    attendance.status = "working";
    attendance.totalTime = calculateWorkingTime(attendance);
    await attendance.save();

    return res.status(200).json({
      success: true,
      message: "Break ended successfully",
      attendance: enrichAttendance(attendance),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error ending break", error: error.message });
  }
};

export const punchOut = async (req, res) => {
  try {
    const today = startOfToday();
    const attendance = await Attendance.findOne({ user: req.user._id, date: today });

    if (!attendance?.punchInTime || (attendance.status !== "working" && attendance.status !== "on_break")) {
      return res.status(400).json({
        success: false,
        message: "You haven't punched in yet or you're not working",
      });
    }

    // Auto-close any open break
    if (attendance.status === "on_break") {
      const lastBreak = attendance.breaks[attendance.breaks.length - 1];
      if (lastBreak && !lastBreak.breakEnd) {
        lastBreak.breakEnd = new Date();
        lastBreak.totalBreakTime = lastBreak.breakEnd - lastBreak.breakStart;
      }
    }

    attendance.punchOutTime = new Date();
    const sessionMs = calculateWorkingTime(attendance);

    attendance.segments = attendance.segments || [];
    attendance.segments.push({
      punchInTime: attendance.punchInTime,
      punchOutTime: attendance.punchOutTime,
      breaks: copyBreaks(attendance.breaks),
      totalTime: sessionMs,
    });

    attendance.dayTotalMs = (attendance.dayTotalMs || 0) + sessionMs;
    attendance.punchInTime = null;
    attendance.punchOutTime = null;
    attendance.breaks = [];
    attendance.status = "not_started";
    attendance.totalTime = attendance.dayTotalMs;

    await attendance.save();

    return res.status(200).json({
      success: true,
      message: "Punched out successfully",
      attendance: enrichAttendance(attendance),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error punching out", error: error.message });
  }
};

// ─── Attendance Queries ────────────────────────────────────────────────────────

export const getAttendance = async (req, res) => {
  try {
    const { _id: userId, role } = req.user;
    const orgContext = req.query.orgContext ?? null;

    const dateQ = parseLocalDateQuery(req.query.date);
    const fromQ = parseLocalDateQuery(req.query.from);
    const toQ = parseLocalDateQuery(req.query.to);

    if (dateQ === false || fromQ === false || toQ === false) {
      return res.status(400).json({ success: false, message: "Invalid date. Use YYYY-MM-DD." });
    }

    const hasRange = Boolean(fromQ && toQ);
    const isSuperAdmin = role === "super-admin";
    const canSeeAll = isSuperAdmin || ((role === "admin" || role === "hr" || role === "manager") && orgContext !== "member");

    let orgUserIds = null;
    if (canSeeAll && !isSuperAdmin) {
      const orgAdminId = resolveOrgAdminId(req.user, orgContext);
      orgUserIds = orgAdminId ? await getOrgCreatorUserIds(orgAdminId) : null;
    }

    // Optional employee filter (admin/hr/manager can filter by a specific user)
    const filterUserId = (canSeeAll && req.query.userId) ? req.query.userId : null;

    let attendance;
    let day, dateFrom, dateTo;

    if (hasRange) {
      if (fromQ.getTime() > toQ.getTime()) {
        return res.status(400).json({ success: false, message: "`from` must be on or before `to`." });
      }
      const spanDays = Math.floor((toQ.getTime() - fromQ.getTime()) / 86400000) + 1;
      if (spanDays > MAX_ATTENDANCE_RANGE_DAYS) {
        return res.status(400).json({ success: false, message: `Date range cannot exceed ${MAX_ATTENDANCE_RANGE_DAYS} days.` });
      }
      dateFrom = fromQ;
      dateTo = toQ;

      const filter = { date: { $gte: dateFrom, $lte: dateTo } };
      if (canSeeAll) {
        if (filterUserId) filter.user = filterUserId;
        else if (orgUserIds) filter.user = { $in: orgUserIds };
      } else {
        filter.user = userId;
      }

      attendance = await Attendance.find(filter).sort({ date: 1, createdAt: -1 }).populate("user", "name email role");
    } else {
      day = dateQ || (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
      dateFrom = dateTo = day;

      const filter = { date: day };
      if (canSeeAll) {
        if (filterUserId) filter.user = filterUserId;
        else if (orgUserIds) filter.user = { $in: orgUserIds };
      } else {
        filter.user = userId;
      }

      attendance = await Attendance.find(filter).sort({ createdAt: -1 }).populate("user", "name email role");
    }

    const enriched = attendance.map(enrichAttendance);

    const payload = {
      success: true,
      message: canSeeAll ? "Team attendance fetched successfully" : "Your attendance fetched successfully",
      attendance: enriched,
    };

    if (hasRange) {
      payload.dateFrom = dateFrom.toISOString();
      payload.dateTo = dateTo.toISOString();
    } else {
      payload.date = day.toISOString();
    }

    return res.status(200).json(payload);
  } catch (error) {
    console.error("❌ Error fetching attendance:", error);
    return res.status(500).json({ success: false, message: "Error getting attendance", error: error.message });
  }
};

// ─── Admin/HR: Correct an Attendance Record ───────────────────────────────────

export const correctAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { punchInTime, punchOutTime, note } = req.body;
    const editorId = req.user._id;
    const editorRole = req.user.role;

    if (!punchInTime || !punchOutTime) {
      return res.status(400).json({ success: false, message: "punchInTime and punchOutTime are required." });
    }

    const pIn = new Date(punchInTime);
    const pOut = new Date(punchOutTime);

    if (isNaN(pIn.getTime()) || isNaN(pOut.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date format for punch times." });
    }
    if (pOut <= pIn) {
      return res.status(400).json({ success: false, message: "punchOutTime must be after punchInTime." });
    }

    const record = await Attendance.findById(id).populate("user", "_id name email managedBy");
    if (!record) {
      return res.status(404).json({ success: false, message: "Attendance record not found." });
    }

    // Non-super-admins can only correct records within their org
    if (editorRole !== "super-admin") {
      const orgAdminId = resolveOrgAdminId(req.user);
      const orgUserIds = orgAdminId ? await getOrgCreatorUserIds(orgAdminId) : [];
      const belongs = orgUserIds.some((uid) => uid.toString() === record.user._id.toString());
      if (!belongs) {
        return res.status(403).json({ success: false, message: "You cannot correct a record outside your organisation." });
      }
    }

    const correctedMs = pOut.getTime() - pIn.getTime();

    record.segments = [{ punchInTime: pIn, punchOutTime: pOut, breaks: [], totalTime: correctedMs }];
    record.punchInTime = null;
    record.punchOutTime = null;
    record.breaks = [];
    record.status = "completed";
    record.dayTotalMs = correctedMs;
    record.totalTime = correctedMs;
    record.isManuallyEdited = true;
    record.editedBy = editorId;
    record.editedAt = new Date();
    record.note = String(note ?? "").trim();

    await record.save();
    await record.populate("user", "name email role");

    return res.status(200).json({
      success: true,
      message: "Attendance corrected successfully.",
      attendance: enrichAttendance(record),
    });
  } catch (error) {
    console.error("❌ Error correcting attendance:", error);
    return res.status(500).json({ success: false, message: "Error correcting attendance", error: error.message });
  }
};

// ─── Attendance Summary (stats for a date range) ─────────────────────────────

export const getAttendanceSummary = async (req, res) => {
  try {
    const { _id: userId, role } = req.user;
    const orgContext = req.query.orgContext ?? null;
    const targetUserId = req.query.userId ?? null;

    const fromQ = parseLocalDateQuery(req.query.from);
    const toQ = parseLocalDateQuery(req.query.to);

    if (!fromQ || !toQ || fromQ === false || toQ === false) {
      return res.status(400).json({ success: false, message: "Valid `from` and `to` dates (YYYY-MM-DD) are required." });
    }
    if (fromQ.getTime() > toQ.getTime()) {
      return res.status(400).json({ success: false, message: "`from` must be on or before `to`." });
    }

    const spanDays = Math.floor((toQ.getTime() - fromQ.getTime()) / 86400000) + 1;
    if (spanDays > MAX_ATTENDANCE_RANGE_DAYS) {
      return res.status(400).json({ success: false, message: `Date range cannot exceed ${MAX_ATTENDANCE_RANGE_DAYS} days.` });
    }

    const isSuperAdmin = role === "super-admin";
    const canSeeAll = isSuperAdmin || role === "admin" || role === "hr" || role === "manager";

    let scopeUserIds;
    if (targetUserId && canSeeAll) {
      scopeUserIds = [targetUserId];
    } else if (canSeeAll) {
      const orgAdminId = resolveOrgAdminId(req.user, orgContext);
      scopeUserIds = orgAdminId ? await getOrgCreatorUserIds(orgAdminId) : null;
    } else {
      scopeUserIds = [userId];
    }

    const filter = { date: { $gte: fromQ, $lte: toQ } };
    if (scopeUserIds) filter.user = { $in: scopeUserIds };

    const records = await Attendance.find(filter)
      .sort({ user: 1, date: 1 })
      .populate("user", "name email role");

    const byUser = new Map();

    for (const r of records) {
      const uid = (r.user?._id ?? r.user).toString();
      if (!byUser.has(uid)) {
        byUser.set(uid, { user: r.user, totalMs: 0, presentDays: 0, lateArrivals: 0, overtimeMs: 0 });
      }
      const entry = byUser.get(uid);
      const worked = r.dayTotalMs || 0;
      entry.totalMs += worked;

      if (worked > 0 || r.status === "completed") {
        entry.presentDays += 1;
      }

      // Late arrival: first punch-in after 9:30 AM local time
      const firstPunchIn = r.segments?.[0]?.punchInTime ?? r.punchInTime;
      if (firstPunchIn) {
        const d = new Date(firstPunchIn);
        if (d.getHours() > 9 || (d.getHours() === 9 && d.getMinutes() > 30)) {
          entry.lateArrivals += 1;
        }
      }

      if (worked > EIGHT_HOURS_MS) {
        entry.overtimeMs += worked - EIGHT_HOURS_MS;
      }
    }

    const summaries = [...byUser.values()].map((e) => ({
      user: e.user,
      period: { from: fromQ.toISOString(), to: toQ.toISOString(), totalCalendarDays: spanDays },
      presentDays: e.presentDays,
      absentDays: Math.max(0, spanDays - e.presentDays),
      totalMs: e.totalMs,
      avgDailyMs: e.presentDays > 0 ? Math.round(e.totalMs / e.presentDays) : 0,
      lateArrivals: e.lateArrivals,
      overtimeMs: e.overtimeMs,
      readableTotalTime: formatDuration(e.totalMs),
      readableAvgDaily: formatDuration(e.presentDays > 0 ? Math.round(e.totalMs / e.presentDays) : 0),
      readableOvertime: formatDuration(e.overtimeMs),
    }));

    return res.status(200).json({
      success: true,
      message: "Attendance summary fetched successfully.",
      summaries,
      dateFrom: fromQ.toISOString(),
      dateTo: toQ.toISOString(),
    });
  } catch (error) {
    console.error("❌ Error fetching attendance summary:", error);
    return res.status(500).json({ success: false, message: "Error fetching attendance summary", error: error.message });
  }
};

// ─── Regularization: Employee Requests Correction ────────────────────────────

export const requestRegularization = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.user._id;
    const { reason, requestedPunchIn, requestedPunchOut } = req.body;

    if (!reason?.trim()) {
      return res.status(400).json({ success: false, message: "Reason is required." });
    }
    if (!requestedPunchIn || !requestedPunchOut) {
      return res.status(400).json({ success: false, message: "requestedPunchIn and requestedPunchOut are required." });
    }

    const pIn = new Date(requestedPunchIn);
    const pOut = new Date(requestedPunchOut);

    if (isNaN(pIn.getTime()) || isNaN(pOut.getTime()) || pOut <= pIn) {
      return res.status(400).json({ success: false, message: "Invalid punch times. punchOut must be after punchIn." });
    }

    const record = await Attendance.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: "Attendance record not found." });
    }

    const role = req.user.role;
    const isPrivileged = role === "admin" || role === "hr" || role === "super-admin";

    if (!isPrivileged && record.user.toString() !== requesterId.toString()) {
      return res.status(403).json({ success: false, message: "You can only regularize your own attendance." });
    }
    if (record.regularization?.status === "pending") {
      return res.status(400).json({ success: false, message: "A regularization request is already pending for this record." });
    }

    record.regularization = {
      status: "pending",
      reason: reason.trim(),
      requestedPunchIn: pIn,
      requestedPunchOut: pOut,
      requestedBy: requesterId,
      requestedAt: new Date(),
      resolvedBy: null,
      resolvedAt: null,
      resolverNote: "",
    };

    await record.save();

    return res.status(200).json({
      success: true,
      message: "Regularization request submitted successfully.",
      attendance: enrichAttendance(record),
    });
  } catch (error) {
    console.error("❌ Error requesting regularization:", error);
    return res.status(500).json({ success: false, message: "Error requesting regularization", error: error.message });
  }
};

// ─── Regularization: Admin/HR Approves or Rejects ────────────────────────────

export const resolveRegularization = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, resolverNote } = req.body;
    const resolverId = req.user._id;

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be 'approve' or 'reject'." });
    }

    const record = await Attendance.findById(id).populate("user", "_id name managedBy");
    if (!record) {
      return res.status(404).json({ success: false, message: "Attendance record not found." });
    }
    if (!record.regularization || record.regularization.status !== "pending") {
      return res.status(400).json({ success: false, message: "No pending regularization request on this record." });
    }

    // Org scope check for non-super-admins
    if (req.user.role !== "super-admin") {
      const orgAdminId = resolveOrgAdminId(req.user);
      const orgUserIds = orgAdminId ? await getOrgCreatorUserIds(orgAdminId) : [];
      const belongs = orgUserIds.some((uid) => uid.toString() === record.user._id.toString());
      if (!belongs) {
        return res.status(403).json({ success: false, message: "You cannot resolve a request outside your organisation." });
      }
    }

    record.regularization.status = action === "approve" ? "approved" : "rejected";
    record.regularization.resolvedBy = resolverId;
    record.regularization.resolvedAt = new Date();
    record.regularization.resolverNote = String(resolverNote ?? "").trim();

    if (action === "approve") {
      const pIn = record.regularization.requestedPunchIn;
      const pOut = record.regularization.requestedPunchOut;
      const correctedMs = pOut.getTime() - pIn.getTime();

      record.segments = [{ punchInTime: pIn, punchOutTime: pOut, breaks: [], totalTime: correctedMs }];
      record.punchInTime = null;
      record.punchOutTime = null;
      record.breaks = [];
      record.status = "completed";
      record.dayTotalMs = correctedMs;
      record.totalTime = correctedMs;
      record.isManuallyEdited = true;
      record.editedBy = resolverId;
      record.editedAt = new Date();
      record.note = `Regularization approved.`;
    }

    await record.save();
    await record.populate("user", "name email role");

    return res.status(200).json({
      success: true,
      message: action === "approve" ? "Regularization approved and applied." : "Regularization rejected.",
      attendance: enrichAttendance(record),
    });
  } catch (error) {
    console.error("❌ Error resolving regularization:", error);
    return res.status(500).json({ success: false, message: "Error resolving regularization", error: error.message });
  }
};

// ─── Regularization: List Requests ────────────────────────────────────────────

export const getRegularizations = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;
    const orgContext = req.query.orgContext ?? null;
    const statusFilter = req.query.status;

    const isSuperAdmin = role === "super-admin";
    const canSeeAll = isSuperAdmin || role === "admin" || role === "hr" || role === "manager";

    let orgUserIds = null;
    if (canSeeAll && !isSuperAdmin) {
      const orgAdminId = resolveOrgAdminId(req.user, orgContext);
      orgUserIds = orgAdminId ? await getOrgCreatorUserIds(orgAdminId) : null;
    }

    const filter = { regularization: { $ne: null } };

    if (statusFilter && ["pending", "approved", "rejected"].includes(statusFilter)) {
      filter["regularization.status"] = statusFilter;
    }

    if (!canSeeAll) {
      filter.user = userId;
    } else if (orgUserIds) {
      filter.user = { $in: orgUserIds };
    }

    const records = await Attendance.find(filter)
      .sort({ "regularization.requestedAt": -1 })
      .populate("user", "name email role")
      .populate("editedBy", "name email");

    return res.status(200).json({
      success: true,
      message: "Regularization requests fetched.",
      records: records.map(enrichAttendance),
    });
  } catch (error) {
    console.error("❌ Error fetching regularizations:", error);
    return res.status(500).json({ success: false, message: "Error fetching regularizations", error: error.message });
  }
};
