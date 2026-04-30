import Attendance from "../model/attendence.model.js";
import { calculateWorkingTime } from "../utils/calculateWorkingTime.js";
import { formatDuration } from "../utils/timeFormatter.js";
import { getOrgCreatorUserIds, resolveOrgAdminId } from "../utils/teamScope.js";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Worked time today: finished segments + current open session (if any). */
function computeDayWorkedMs(attendance) {
  const base = attendance.dayTotalMs || 0;
  if (!attendance.punchInTime) return base;
  if (attendance.status !== "working" && attendance.status !== "on_break") {
    return base;
  }
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

export const punchIn = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = startOfToday();

    let record = await Attendance.findOne({ user: userId, date: today });

    if (
      record &&
      record.punchInTime &&
      (record.status === "working" || record.status === "on_break")
    ) {
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
      if (
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
    return res.status(500).json({
      success: false,
      message: "Error punching in",
      error: error.message,
    });
  }
};

export const startBreak = async (req, res) => {
  const userId = req.user._id;

  try {
    const today = startOfToday();

    const attendance = await Attendance.findOne({ user: userId, date: today });

    if (!attendance || !attendance.punchInTime) {
      return res.status(400).json({
        success: false,
        message: "You haven't punched in yet",
      });
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
    return res.status(500).json({
      success: false,
      message: "Error starting break",
      error: error.message,
    });
  }
};

export const endBreak = async (req, res) => {
  const userId = req.user._id;

  try {
    const today = startOfToday();
    const attendance = await Attendance.findOne({ user: userId, date: today });

    if (
      !attendance ||
      !attendance.punchInTime ||
      attendance.status !== "on_break"
    ) {
      return res.status(400).json({
        success: false,
        message: "You haven't started a break yet",
      });
    }

    const currentBreak = attendance.breaks[attendance.breaks.length - 1];
    currentBreak.breakEnd = new Date();
    currentBreak.totalBreakTime =
      currentBreak.breakEnd - currentBreak.breakStart;

    attendance.status = "working";
    attendance.totalTime = calculateWorkingTime(attendance);
    await attendance.save();

    return res.status(200).json({
      success: true,
      message: "Break ended successfully",
      attendance: enrichAttendance(attendance),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error ending break",
      error: error.message,
    });
  }
};

export const punchOut = async (req, res) => {
  const userId = req.user._id;

  try {
    const today = startOfToday();
    const attendance = await Attendance.findOne({ user: userId, date: today });

    if (
      !attendance ||
      !attendance.punchInTime ||
      (attendance.status !== "working" && attendance.status !== "on_break")
    ) {
      return res.status(400).json({
        success: false,
        message: "You haven't punched in yet or you're not working",
      });
    }

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
    return res.status(500).json({
      success: false,
      message: "Error punching out",
      error: error.message,
    });
  }
};

function parseLocalDateQuery(dateParam) {
  if (dateParam === undefined || dateParam === null || String(dateParam).trim() === "") {
    return null;
  }
  const s = String(dateParam).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const day = new Date(y, mo, d);
  day.setHours(0, 0, 0, 0);
  if (day.getFullYear() !== y || day.getMonth() !== mo || day.getDate() !== d) {
    return false;
  }
  return day;
}

/** Allows month-wide calendar views in a single range query. */
const MAX_ATTENDANCE_RANGE_DAYS = 62;

export const getAttendance = async (req, res) => {
  try {
    const { _id: userId, role } = req.user;
    const orgContext = req.query.orgContext ?? null;

    const dateQ = parseLocalDateQuery(req.query.date);
    const fromQ = parseLocalDateQuery(req.query.from);
    const toQ = parseLocalDateQuery(req.query.to);

    if (dateQ === false || fromQ === false || toQ === false) {
      return res.status(400).json({
        success: false,
        message: "Invalid date. Use YYYY-MM-DD.",
      });
    }

    const hasRange = Boolean(fromQ && toQ);

    // Admin/super-admin can see team-wide data, but only when in their owned-org context.
    // When in "member" context (viewing a joined org) they act as an employee.
    const isSuperAdmin = role === "super-admin";
    const canSeeAll =
      isSuperAdmin || ((role === "admin") && orgContext !== "member");

    // Resolve org-scoped user list for non-super-admins who can see all
    let orgUserIds = null;
    if (canSeeAll && !isSuperAdmin) {
      const orgAdminId = resolveOrgAdminId(req.user, orgContext);
      orgUserIds = orgAdminId ? await getOrgCreatorUserIds(orgAdminId) : null;
    }

    let attendance;
    let day;
    let dateFrom;
    let dateTo;

    if (hasRange) {
      if (fromQ.getTime() > toQ.getTime()) {
        return res.status(400).json({
          success: false,
          message: "`from` must be on or before `to`.",
        });
      }
      const spanDays =
        Math.floor((toQ.getTime() - fromQ.getTime()) / 86400000) + 1;
      if (spanDays > MAX_ATTENDANCE_RANGE_DAYS) {
        return res.status(400).json({
          success: false,
          message: `Date range cannot exceed ${MAX_ATTENDANCE_RANGE_DAYS} days.`,
        });
      }
      dateFrom = fromQ;
      dateTo = toQ;

      if (canSeeAll) {
        const filter = { date: { $gte: dateFrom, $lte: dateTo } };
        if (orgUserIds) filter.user = { $in: orgUserIds };
        attendance = await Attendance.find(filter)
          .sort({ date: 1, createdAt: -1 })
          .populate("user", "name email role");
      } else {
        attendance = await Attendance.find({
          user: userId,
          date: { $gte: dateFrom, $lte: dateTo },
        })
          .sort({ date: 1 })
          .populate("user", "name email role");
      }
    } else {
      if (dateQ) {
        day = dateQ;
      } else {
        day = new Date();
        day.setHours(0, 0, 0, 0);
      }
      dateFrom = day;
      dateTo = day;

      if (canSeeAll) {
        const filter = { date: day };
        if (orgUserIds) filter.user = { $in: orgUserIds };
        attendance = await Attendance.find(filter)
          .sort({ createdAt: -1 })
          .populate("user", "name email role");
      } else {
        attendance = await Attendance.find({ user: userId, date: day })
          .sort({ date: -1 })
          .populate("user", "name email role");
      }
    }

    const enriched = attendance.map((a) => enrichAttendance(a));

    const payload = {
      success: true,
      message: canSeeAll
        ? hasRange
          ? "Team attendance for the selected range"
          : "All users' attendance fetched successfully"
        : hasRange
          ? "Your attendance for the selected range"
          : "Your attendance fetched successfully",
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
    return res.status(500).json({
      success: false,
      message: "Error getting attendance",
      error: error.message,
    });
  }
};
