import Leave from "../model/leave.model.js";
import User from "../model/user.model.js";
import { getOrgCreatorUserIds, resolveOrgAdminId } from "../utils/teamScope.js";
import {
  getOrgHolidayDatesInRange,
  countWorkingDays,
  isHolidayDate,
} from "./holiday.controller.js";
import { leaveRequestTemplate } from "../utils/mailService/leaveRequestTemplate.js";
import { leaveStatusTemplate } from "../utils/mailService/leaveStatusTemplat.js";
import { sendEmail } from "../utils/mailService/sendMail.js";
import { signLeaveEmailActionToken, verifyLeaveEmailActionToken } from "../utils/leaveEmailActionToken.js";

/** Calendar days for this leave (0.5 for half-day). */
function computeLeaveDayCount(leave) {
  let totalDays = 1;
  if (leave.days === "multiple" && leave.fromDate && leave.toDate) {
    const diff =
      new Date(leave.toDate).getTime() - new Date(leave.fromDate).getTime();
    totalDays = Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  }
  if (leave.subType === "halfDay") totalDays = 0.5;
  return totalDays;
}

function refundReservedBalances(user, leave, totalDays) {
  if (!user?.leaves?.length) return;
  const b = user.leaves[0];
  let fromPaid = Number(leave.deductedFromPaid) || 0;
  let fromAnnual = Number(leave.deductedFromAnnual) || 0;
  // New requests store deductedFrom*; legacy paid-only rows may lack them
  if (fromPaid === 0 && fromAnnual === 0 && leave.type === "paidLeave") {
    fromPaid = totalDays;
  }
  b.paidLeave = Math.round((Number(b.paidLeave) + fromPaid) * 2) / 2;
  b.totalBalance = Math.round((Number(b.totalBalance) + fromAnnual) * 2) / 2;
  user.markModified("leaves");
}

/**
 * Updates balances, leave status, emails employee. Caller enforces auth / duplicate checks.
 * @param {import("mongoose").Document} leave populated with `user`
 */
async function persistLeaveStatusChange(leave, status, adminComment) {
  const user = leave.user;
  if (!user) {
    throw new Error("Employee record not found for this leave");
  }

  // workingDays is stored at apply time (holiday-adjusted); fall back to raw count for legacy rows
  const totalDays = leave.workingDays ?? computeLeaveDayCount(leave);
  const prevStatus = leave.status;

  if (!user.leaves || user.leaves.length === 0) {
    user.leaves = [{ totalBalance: 24, paidLeave: 12, leaveTaken: 0 }];
  }
  const leaveBalance = user.leaves[0];

  if (status === "approved" && prevStatus === "pending") {
    leaveBalance.leaveTaken = Math.round((Number(leaveBalance.leaveTaken) + totalDays) * 2) / 2;
    user.markModified("leaves");
    await user.save();
  }

  if (status === "rejected" && user.leaves?.length > 0) {
    if (prevStatus === "pending") {
      refundReservedBalances(user, leave, totalDays);
      await user.save();
    } else if (prevStatus === "approved") {
      leaveBalance.leaveTaken = Math.max(
        0,
        Math.round((Number(leaveBalance.leaveTaken) - totalDays) * 2) / 2
      );
      refundReservedBalances(user, leave, totalDays);
      user.markModified("leaves");
      await user.save();
    }
  }

  leave.status = status;
  leave.adminComment = adminComment || "";
  await leave.save();

  const html = leaveStatusTemplate({
    employeeName: user.name,
    status,
    leaveType: leave.type,
    fromDate: leave.fromDate,
    toDate: leave.toDate,
  });
  // sendEmail disabled — uncomment to notify employee of leave approval/rejection
  // await sendEmail(user.email, "Leave Status Update", html);
}

function leaveEmailActionBaseUrl() {
  const raw =
    process.env.PUBLIC_LEAVE_API_BASE ||
    `http://localhost:${process.env.PORT || 5051}/api/v1/leave`;
  return String(raw).replace(/\/$/, "");
}

function htmlResultPage(title, message) {
  const t = String(title).replace(/</g, "&lt;");
  const m = String(message).replace(/</g, "&lt;");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${t}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#111;">
  <h1 style="font-size:1.25rem;margin:0 0 12px;">${t}</h1>
  <p style="margin:0;line-height:1.5;color:#444;">${m}</p>
</body></html>`;
}

export const applyLeave = async (req, res) => {
  const { days, subType, fromDate, toDate, reason } = req.body;
  const userId = req.user._id;

  try {
    // Validate dates
    if (days === "single" && !fromDate) {
      return res.status(400).json({
        success: false,
        message: "fromDate is required for single day leave",
      });
    }
    if (days === "multiple" && (!fromDate || !toDate)) {
      return res.status(400).json({
        success: false,
        message: "fromDate and toDate are required for multiple day leave",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Initialize leave balance if missing
    if (!user.leaves || user.leaves.length === 0) {
      user.leaves = [{ totalBalance: 24, paidLeave: 12, leaveTaken: 0 }];
    }

    const leaveBalance = user.leaves[0];
    const from = new Date(fromDate);
    const month = from.getMonth();
    const year = from.getFullYear();

    // ✅ Count all leaves this month (approved or pending)
    const existingLeaves = await Leave.find({
      user: userId,
      status: { $in: ["approved", "pending"] },
      fromDate: {
        $gte: new Date(year, month, 1),
        $lte: new Date(year, month + 1, 0),
      },
    });

    let leaveType = "unpaidLeave";
    let deductedFromPaid = 0;
    let deductedFromAnnual = 0;

    const orgAdminId = resolveOrgAdminId(user);

    // Holiday-aware day count
    let totalDays;
    if (subType === "halfDay") {
      const holidayName = await isHolidayDate(orgAdminId, fromDate);
      if (holidayName) {
        return res.status(400).json({
          success: false,
          message: `${holidayName} is a company holiday. No leave required.`,
        });
      }
      totalDays = 0.5;
    } else if (days === "single") {
      const holidayName = await isHolidayDate(orgAdminId, fromDate);
      if (holidayName) {
        return res.status(400).json({
          success: false,
          message: `${holidayName} is a company holiday. No leave required.`,
        });
      }
      totalDays = 1;
    } else {
      // multiple days — subtract holidays
      const holidaySet = await getOrgHolidayDatesInRange(orgAdminId, fromDate, toDate);
      totalDays = countWorkingDays(fromDate, toDate, holidaySet);
      if (totalDays === 0) {
        return res.status(400).json({
          success: false,
          message: "All selected dates are company holidays. No leave required.",
        });
      }
    }

    // ✅ Only the very first leave in this month gets "paidLeave"
    if (existingLeaves.length === 0 && leaveBalance.paidLeave > 0) {
      leaveType = "paidLeave";
      leaveBalance.paidLeave = Math.round((Number(leaveBalance.paidLeave) - totalDays) * 2) / 2;
      deductedFromPaid = totalDays;
    } else {
      // If already taken or requested paid leave this month
      if (leaveBalance.totalBalance >= totalDays) {
        leaveBalance.totalBalance = Math.round((Number(leaveBalance.totalBalance) - totalDays) * 2) / 2;
        deductedFromAnnual = totalDays;
      } else {
        leaveType = "unpaidLeave";
      }
    }

    // Create leave record (leaveTaken is updated only when HR approves — not on apply)
    const leave = await Leave.create({
      user: userId,
      type: leaveType,
      days,
      subType,
      fromDate,
      toDate: days === "multiple" ? toDate : fromDate,
      reason,
      deductedFromPaid,
      deductedFromAnnual,
      workingDays: totalDays,
    });

    user.markModified("leaves");
    await user.save();

    const hrEmail = process.env.ADMIN_EMAIL;
    const base = leaveEmailActionBaseUrl();
    const lid = leave._id.toString();
    const approveUrl = `${base}/email-action?token=${encodeURIComponent(signLeaveEmailActionToken(lid, "approve"))}`;
    const rejectUrl = `${base}/email-action?token=${encodeURIComponent(signLeaveEmailActionToken(lid, "reject"))}`;
    const reviewInAppUrl = process.env.FRONTEND_URL
      ? `${String(process.env.FRONTEND_URL).replace(/\/$/, "")}/leave`
      : "";

    const html = leaveRequestTemplate({
      employeeName: user.name,
      leaveType: leaveType,
      fromDate: fromDate,
      toDate: toDate,
      reason: reason,
      approveUrl,
      rejectUrl,
      reviewInAppUrl,
    });

    // sendEmail disabled — uncomment to notify HR of new leave request
    // await sendEmail(hrEmail, "New Leave Request Submitted", html);
    console.log("Leave request submitted (email disabled)");
    res.status(201).json({
      success: true,
      message: "Leave request applied successfully",
      leave,
      updatedBalance: leaveBalance,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A leave request for these dates already exists.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Error applying leave",
      error: error.message,
    });
  }
};

export const updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminComment } = req.body;
    const loggedInUser = req.user; // from auth middleware

    // ✅ Only admin or HR can update leave status
    if (!["admin", "hr", "super-admin"].includes(loggedInUser.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only admin or HR can change leave status.",
      });
    }

    // ✅ Fetch leave and populate user details
    const leave = await Leave.findById(id).populate("user");
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave not found",
      });
    }

    // ✅ Prevent updating if already in final state
    if (leave.status === "rejected" && status === "rejected") {
      return res.status(400).json({
        success: false,
        message: "This leave has already been rejected.",
      });
    }

    if (leave.status === "approved" && status === "approved") {
      return res.status(400).json({
        success: false,
        message: "This leave has already been approved.",
      });
    }

    const user = leave.user;
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Employee record not found for this leave",
      });
    }

    await persistLeaveStatusChange(leave, status, adminComment || "");
    console.log(`Email sent to ${user.email}`);

    res.status(200).json({
      success: true,
      message: `Leave ${status} successfully.`,
      leave,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating leave status",
      error: error.message,
    });
  }
};

/** One-click approve/reject from HR email (signed JWT, no session). */
export const leaveEmailAction = async (req, res) => {
  try {
    const token = req.query.token;
    if (!token || typeof token !== "string") {
      return res
        .status(400)
        .type("html")
        .send(htmlResultPage("Invalid link", "This link is missing a token. Open the app to review leave requests."));
    }

    let lid;
    let act;
    try {
      ({ lid, act } = verifyLeaveEmailActionToken(token));
    } catch {
      return res
        .status(400)
        .type("html")
        .send(
          htmlResultPage(
            "Link expired or invalid",
            "Ask the employee to resubmit or review this request in the app under Leave → Team inbox."
          )
        );
    }

    const status = act === "approve" ? "approved" : "rejected";
    const leave = await Leave.findById(lid).populate("user");
    if (!leave) {
      return res
        .status(404)
        .type("html")
        .send(htmlResultPage("Not found", "This leave request no longer exists."));
    }

    if (leave.status !== "pending") {
      return res
        .status(200)
        .type("html")
        .send(
          htmlResultPage(
            "Already processed",
            `This request is already ${leave.status}. No change was made.`
          )
        );
    }

    const comment =
      status === "approved"
        ? "Approved via email link"
        : "Rejected via email link";

    await persistLeaveStatusChange(leave, status, comment);

    return res
      .status(200)
      .type("html")
      .send(
        htmlResultPage(
          status === "approved" ? "Leave approved" : "Leave rejected",
          "The employee has been notified by email. You can close this tab."
        )
      );
  } catch (err) {
    console.error("leaveEmailAction", err);
    return res
      .status(500)
      .type("html")
      .send(
        htmlResultPage(
          "Something went wrong",
          "Please sign in and use Leave → Team inbox to approve or reject this request."
        )
      );
  }
};

export const getLeaveHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const q = req.query;
    const hasPage = q.page !== undefined && q.page !== "";
    const hasLimit = q.limit !== undefined && q.limit !== "";
    const usePagination = hasPage || hasLimit;

    if (!usePagination) {
      const leaves = await Leave.find({ user: userId }).sort({ createdAt: -1 }).lean();
      return res.status(200).json({
        success: true,
        message: "Leave history fetched successfully",
        leaves,
      });
    }

    const page = Math.max(1, parseInt(String(q.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(q.limit), 10) || 10));
    const filter = { user: userId };
    const statusQ = q.status;
    if (
      statusQ &&
      statusQ !== "all" &&
      ["pending", "approved", "rejected"].includes(String(statusQ))
    ) {
      filter.status = String(statusQ);
    }

    const skip = (page - 1) * limit;
    const [leaves, total] = await Promise.all([
      Leave.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Leave.countDocuments(filter),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.status(200).json({
      success: true,
      message: "Leave history fetched successfully",
      leaves,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching leave history",
      error: error.message,
    });
  }
};

/** Pending requests scoped to the admin's own org. */
export const getPendingLeaveRequests = async (req, res) => {
  try {
    const role = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
    const orgContext = req.query.orgContext ?? null;

    let filter = { status: "pending" };

    if (role !== "super-admin") {
      const orgAdminId = resolveOrgAdminId(req.user, orgContext);
      if (!orgAdminId) {
        return res.status(200).json({ success: true, message: "Pending leave requests fetched successfully", leaves: [] });
      }
      let orgUserIds = await getOrgCreatorUserIds(orgAdminId);
      // In member context exclude own leaves (they belong to owned-org scope)
      if (orgContext === "member") {
        orgUserIds = orgUserIds.filter((id) => id.toString() !== req.user._id.toString());
      }
      filter.user = { $in: orgUserIds };
    }

    const leaves = await Leave.find(filter)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      message: "Pending leave requests fetched successfully",
      leaves,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching pending leave requests",
      error: error.message,
    });
  }
};

export const getLeaveById = async (req, res) => {
  const { id } = req.params;
  try {
    const leave = await Leave.findById(id).populate("user", "name leaves");
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Leave fetched successfully",
      leave,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching leave",
      error: error.message,
    });
  }
};
