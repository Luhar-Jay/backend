import Expense from "../model/expenses.model.js";
import ExpenseCategory from "../model/expenseCategory.model.js";
import { resolveOrgAdminId, getOrgCreatorUserIds } from "../utils/teamScope.js";

export const createExpense = async (req, res) => {
  try {
    const { amount, date, description, category } = req.body;
    const orgAdminId = resolveOrgAdminId(req.user);

    const expenseCategory = await ExpenseCategory.findById(category);
    if (!expenseCategory || !expenseCategory.isActive) {
      return res.status(404).json({ success: false, message: "Expense category not found or inactive" });
    }

    const expense = await Expense.create({
      employee: req.user._id,
      organization: orgAdminId,
      amount,
      expenseDate: date,
      description,
      category: expenseCategory._id,
      receiptUrl: req.file?.path ?? null,
      receiptPublicId: req.file?.filename ?? null,
      status: "pending",
    });

    await expense.populate([
      { path: "category", select: "name isActive" },
      { path: "employee", select: "name email" },
    ]);

    return res.status(201).json({
      success: true,
      message: "Expense submitted successfully",
      expense,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Error creating expense", error: error.message });
  }
};

export const getMyExpenses = async (req, res) => {
  try {
    const { status, category, fromDate, toDate, page, limit } = req.query;

    const filter = { employee: req.user._id };
    if (status && status !== "all") filter.status = status;
    if (category) filter.category = category;
    if (fromDate || toDate) {
      filter.expenseDate = {};
      if (fromDate) filter.expenseDate.$gte = new Date(fromDate);
      if (toDate) filter.expenseDate.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
    }

    const pg = Math.max(1, parseInt(page) || 1);
    const lim = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const skip = (pg - 1) * lim;

    const [expenses, total] = await Promise.all([
      Expense.find(filter)
        .populate("category", "name")
        .populate("approvedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim)
        .lean(),
      Expense.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: "Expenses fetched successfully",
      expenses,
      pagination: {
        page: pg,
        limit: lim,
        total,
        totalPages: Math.max(1, Math.ceil(total / lim)),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Error fetching expenses", error: error.message });
  }
};

export const getExpenses = async (req, res) => {
  try {
    const { status, category, fromDate, toDate, employeeId, page, limit, month, year } = req.query;
    const orgAdminId = resolveOrgAdminId(req.user);

    const filter = {};

    if (orgAdminId) {
      const orgUserIds = await getOrgCreatorUserIds(orgAdminId);
      filter.employee = { $in: orgUserIds };
    }

    if (employeeId) filter.employee = employeeId;
    if (status && status !== "all") filter.status = status;
    if (category) filter.category = category;

    if (month && year) {
      const m = parseInt(month) - 1;
      const y = parseInt(year);
      filter.expenseDate = {
        $gte: new Date(y, m, 1),
        $lte: new Date(y, m + 1, 0, 23, 59, 59),
      };
    } else if (fromDate || toDate) {
      filter.expenseDate = {};
      if (fromDate) filter.expenseDate.$gte = new Date(fromDate);
      if (toDate) filter.expenseDate.$lte = new Date(new Date(toDate).setHours(23, 59, 59, 999));
    }

    const pg = Math.max(1, parseInt(page) || 1);
    const lim = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const skip = (pg - 1) * lim;

    const [expenses, total] = await Promise.all([
      Expense.find(filter)
        .populate("employee", "name email")
        .populate("category", "name")
        .populate("approvedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim)
        .lean(),
      Expense.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: "Expenses fetched successfully",
      expenses,
      pagination: {
        page: pg,
        limit: lim,
        total,
        totalPages: Math.max(1, Math.ceil(total / lim)),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Error fetching expenses", error: error.message });
  }
};

export const getExpenseById = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id)
      .populate("employee", "name email")
      .populate("category", "name isActive")
      .populate("approvedBy", "name email")
      .lean();

    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    const role = req.user.role;
    const isOwner = expense.employee._id.toString() === req.user._id.toString();
    if (!isOwner && !["admin", "hr", "manager", "super-admin"].includes(role)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    return res.status(200).json({ success: true, message: "Expense fetched successfully", expense });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Error fetching expense", error: error.message });
  }
};

export const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, date, description, category } = req.body;

    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    if (expense.employee.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "You can only edit your own expenses" });
    }

    if (!["draft", "pending"].includes(expense.status)) {
      return res.status(400).json({
        success: false,
        message: `Expense with status '${expense.status}' cannot be edited`,
      });
    }

    if (category) {
      const cat = await ExpenseCategory.findById(category);
      if (!cat || !cat.isActive) {
        return res.status(404).json({ success: false, message: "Expense category not found or inactive" });
      }
      expense.category = cat._id;
    }

    if (amount !== undefined) expense.amount = amount;
    if (date) expense.expenseDate = date;
    if (description !== undefined) expense.description = description;
    if (req.file?.path) {
      expense.receiptUrl = req.file.path;
      expense.receiptPublicId = req.file.filename;
    }

    await expense.save();
    await expense.populate([
      { path: "category", select: "name isActive" },
      { path: "employee", select: "name email" },
    ]);

    return res.status(200).json({ success: true, message: "Expense updated successfully", expense });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Error updating expense", error: error.message });
  }
};

export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    const role = req.user.role;
    const isOwner = expense.employee.toString() === req.user._id.toString();

    if (!isOwner && !["admin", "hr", "super-admin"].includes(role)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (isOwner && !["draft", "pending"].includes(expense.status)) {
      return res.status(400).json({
        success: false,
        message: "Approved or reimbursed expenses cannot be deleted",
      });
    }

    await expense.deleteOne();
    return res.status(200).json({ success: true, message: "Expense deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Error deleting expense", error: error.message });
  }
};

export const reviewExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, comment } = req.body;

    const role = req.user.role;
    if (!["admin", "hr", "manager", "super-admin"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Only admin, HR, or manager can review expenses",
      });
    }

    const expense = await Expense.findById(id).populate("employee", "name email");
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    if (expense.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Expense is already '${expense.status}' and cannot be reviewed again`,
      });
    }

    expense.status = status;
    expense.approvedBy = req.user._id;
    expense.approvedAt = new Date();
    if (status === "rejected") {
      expense.rejectionReason = comment || "";
    }

    await expense.save();
    await expense.populate([
      { path: "category", select: "name" },
      { path: "approvedBy", select: "name email" },
    ]);

    return res.status(200).json({
      success: true,
      message: `Expense ${status} successfully`,
      expense,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Error reviewing expense", error: error.message });
  }
};

export const markReimbursed = async (req, res) => {
  try {
    const { id } = req.params;
    const { payrollIncluded } = req.body;

    const role = req.user.role;
    if (!["admin", "hr", "super-admin"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Only admin or HR can mark expenses as reimbursed",
      });
    }

    const expense = await Expense.findById(id).populate("employee", "name email");
    if (!expense) {
      return res.status(404).json({ success: false, message: "Expense not found" });
    }

    if (expense.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Only approved expenses can be marked as reimbursed",
      });
    }

    expense.status = "reimbursed";
    expense.reimbursedAt = new Date();
    expense.payrollIncluded = payrollIncluded ?? false;

    await expense.save();
    await expense.populate("category", "name");

    return res.status(200).json({ success: true, message: "Expense marked as reimbursed", expense });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Error marking expense as reimbursed", error: error.message });
  }
};

export const getMonthlyReport = async (req, res) => {
  try {
    const role = req.user.role;
    if (!["admin", "hr", "super-admin"].includes(role)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { month, year, employeeId } = req.query;
    if (!month || !year) {
      return res.status(400).json({ success: false, message: "month and year are required" });
    }

    const m = parseInt(month) - 1;
    const y = parseInt(year);
    const orgAdminId = resolveOrgAdminId(req.user);

    const filter = {
      expenseDate: {
        $gte: new Date(y, m, 1),
        $lte: new Date(y, m + 1, 0, 23, 59, 59),
      },
      status: { $in: ["approved", "reimbursed"] },
    };

    if (orgAdminId) {
      const orgUserIds = await getOrgCreatorUserIds(orgAdminId);
      filter.employee = { $in: orgUserIds };
    }

    if (employeeId) filter.employee = employeeId;

    const expenses = await Expense.find(filter)
      .populate("employee", "name email")
      .populate("category", "name")
      .lean();

    const reportMap = new Map();
    for (const exp of expenses) {
      const empId = exp.employee._id.toString();
      if (!reportMap.has(empId)) {
        reportMap.set(empId, {
          employee: exp.employee,
          totalAmount: 0,
          reimbursedAmount: 0,
          pendingReimbursementAmount: 0,
          expenseCount: 0,
          expenses: [],
        });
      }
      const entry = reportMap.get(empId);
      entry.totalAmount += exp.amount;
      entry.expenseCount += 1;
      if (exp.status === "reimbursed") {
        entry.reimbursedAmount += exp.amount;
      } else {
        entry.pendingReimbursementAmount += exp.amount;
      }
      entry.expenses.push(exp);
    }

    const report = [...reportMap.values()];
    const grandTotal = report.reduce((sum, r) => sum + r.totalAmount, 0);

    return res.status(200).json({
      success: true,
      message: "Monthly expense report fetched successfully",
      month: parseInt(month),
      year: y,
      grandTotal,
      report,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Error generating monthly report", error: error.message });
  }
};

export const getExpenseSummary = async (req, res) => {
  try {
    const role = req.user.role;
    if (!["admin", "hr", "super-admin"].includes(role)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const orgAdminId = resolveOrgAdminId(req.user);
    const matchFilter = {};

    if (orgAdminId) {
      const orgUserIds = await getOrgCreatorUserIds(orgAdminId);
      matchFilter.employee = { $in: orgUserIds };
    }

    const agg = await Expense.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    const summary = {
      draft: { count: 0, totalAmount: 0 },
      pending: { count: 0, totalAmount: 0 },
      approved: { count: 0, totalAmount: 0 },
      rejected: { count: 0, totalAmount: 0 },
      reimbursed: { count: 0, totalAmount: 0 },
    };

    for (const s of agg) {
      if (summary[s._id]) {
        summary[s._id] = { count: s.count, totalAmount: s.totalAmount };
      }
    }

    const grandTotal = Object.values(summary).reduce((sum, s) => sum + s.totalAmount, 0);

    return res.status(200).json({
      success: true,
      message: "Expense summary fetched successfully",
      summary,
      grandTotal,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Error fetching expense summary", error: error.message });
  }
};
