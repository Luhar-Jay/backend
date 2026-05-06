import ExpenseCategory from "../model/expenseCategory.model.js";
import { resolveOrgAdminId } from "../utils/teamScope.js";

export const createExpenseCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const orgAdminId = resolveOrgAdminId(req.user);

    const existing = await ExpenseCategory.findOne({ name: name.trim(), organization: orgAdminId });
    if (existing) {
      return res.status(409).json({ success: false, message: "Category with this name already exists" });
    }

    const expenseCategory = await ExpenseCategory.create({
      name,
      organization: orgAdminId,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: "Expense category created successfully",
      expenseCategory,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Error creating expense category", error: error.message });
  }
};

export const getExpenseCategories = async (req, res) => {
  try {
    const orgAdminId = resolveOrgAdminId(req.user);

    const filter = { isActive: true };
    if (orgAdminId) {
      filter.$or = [{ organization: orgAdminId }, { organization: null }];
    }

    const expenseCategories = await ExpenseCategory.find(filter).sort({ name: 1 }).lean();

    return res.status(200).json({
      success: true,
      message: "Expense categories fetched successfully",
      expenseCategories,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Error fetching expense categories", error: error.message });
  }
};

export const updateExpenseCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isActive } = req.body;

    const expenseCategory = await ExpenseCategory.findById(id);
    if (!expenseCategory) {
      return res.status(404).json({ success: false, message: "Expense category not found" });
    }

    if (name !== undefined) expenseCategory.name = name;
    if (isActive !== undefined) expenseCategory.isActive = isActive;

    await expenseCategory.save();

    return res.status(200).json({
      success: true,
      message: "Expense category updated successfully",
      expenseCategory,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Error updating expense category", error: error.message });
  }
};

export const deleteExpenseCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const expenseCategory = await ExpenseCategory.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    ).lean();

    if (!expenseCategory) {
      return res.status(404).json({ success: false, message: "Expense category not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Expense category deactivated successfully",
      expenseCategory,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Error deleting expense category", error: error.message });
  }
};
