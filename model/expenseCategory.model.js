import mongoose from "mongoose";

const expenseCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

expenseCategorySchema.index({ organization: 1, isActive: 1 });

const ExpenseCategory = mongoose.model("ExpenseCategory", expenseCategorySchema);
export default ExpenseCategory;