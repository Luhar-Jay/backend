import path from "path";
import fs from "fs";
import Salary from "../model/salary.model.js";
import User from "../model/user.model.js";
import { generateSalarySlip } from "../utils/generatePdf.js";
import { getOrgCreatorUserIds, resolveOrgAdminId } from "../utils/teamScope.js";

export const createSalary = async (req, res) => {
  const { employee, month, year, basicSalary, bonus, deductions, payDate } =
    req.body;

  try {
    const user = await User.findById(employee);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Check for existing salary slip for the same month and year
    const existingSalarySlip = await Salary.findOne({ employee, month, year });

    if (existingSalarySlip) {
      return res.status(400).json({
        success: false,
        message: `Salary slip for ${month} ${year} already exists`,
      });
    }

    // calculate net salary
    const netSalarySlip = basicSalary + bonus - deductions;

    const salary = await Salary.create({
      employee,
      month,
      year,
      basicSalary,
      bonus,
      deductions,
      netSalary: netSalarySlip,
      payDate,
      createdBy: req.user._id,
    });

    return res.status(200).json({
      success: true,
      message: "Salary slip created successfully",
      salary,
      createdBy: req.user._id,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error getting create salary slip",
      error: error.message,
    });
  }
};
export const getSalary = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const role = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
    const orgContext = req.query.orgContext ?? null;

    let filter = {};
    if (role !== "super-admin") {
      const orgAdminId = resolveOrgAdminId(req.user, orgContext);
      if (!orgAdminId) {
        return res.status(200).json({
          success: true, message: "Fetched all salary slips",
          salary: [], total: 0, page: 1, totalPages: 1,
          hasNextPage: false, hasPreviousPage: false, nextPage: null, previousPage: null,
        });
      }
      let orgUserIds = await getOrgCreatorUserIds(orgAdminId);
      if (orgContext === "member") {
        orgUserIds = orgUserIds.filter((id) => id.toString() !== req.user._id.toString());
      }
      filter.employee = { $in: orgUserIds };
    }

    const total = await Salary.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;
    const nextPage = hasNextPage ? page + 1 : null;
    const previousPage = hasPreviousPage ? page - 1 : null;
    const salary = await Salary.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .populate("employee", "name");
    return res.status(200).json({
      success: true,
      message: "Fetched all salary slips",
      salary,
      total,
      page,
      totalPages,
      hasNextPage,
      hasPreviousPage,
      nextPage,
      previousPage,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error getting fetched All salary slips",
    });
  }
};
export const updateSalary = async (req, res) => {
  const { id } = req.params;
  const { deductions, bonus, basicSalary } = req.body;

  try {
    const existingSalary = await Salary.findById(id);
    if (!existingSalary) {
      return res.status(404).json({
        success: false,
        message: "Salary slip not found",
      });
    }

    //Recalculate salary
    const netSalary =
      (basicSalary ?? existingSalary.basicSalary) +
      (bonus ?? existingSalary.bonus) -
      (deductions ?? existingSalary.deductions);

    const salary = await Salary.findByIdAndUpdate(
      id,
      {
        basicSalary: basicSalary ?? existingSalary.basicSalary,
        bonus: bonus ?? existingSalary.bonus,
        deductions: deductions ?? existingSalary.deductions,
        netSalary,
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Salary updated successfully",
      salary,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error getting update salary",
    });
  }
};
export const getSalaryById = async (req, res) => {
  const { id } = req.params;

  try {
    const salary = await Salary.findById(id);

    if (!salary) {
      return res.status(404).json({
        success: false,
        message: "Salary not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Salary fetched successfully",
      salary,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error getting fetched salary",
    });
  }
};
export const deleteSalary = async (req, res) => {
  const { id } = req.params;
  try {
    const salary = await Salary.findByIdAndDelete(id);
    if (!salary) {
      return res.status(404).json({
        success: false,
        message: "Salary not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Salary deleted successfully",
      salary,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error getting update salary",
    });
  }
};

export const generatePDF = async (req, res) => {
  const { id } = req.params;

  try {
    const salary = await Salary.findById(id).populate("employee", "name");

    if (!salary) {
      return res.status(404).json({
        success: false,
        message: "Salary slip not found",
      });
    }

    const fileName = `salary-slip-${salary.employee.name}-${salary.month}-${salary.year}.pdf`;

    const filePath = path.join("upload", fileName);

    // Ensure folder exists
    if (!fs.existsSync("upload")) {
      fs.mkdirSync("upload");
    }

    // Generate PDF
    await generateSalarySlip(salary, filePath);

    // Send file as download
    return res.download(filePath, fileName, (err) => {
      if (err) {
        console.error("Download error:", err);
      }

      // OPTIONAL: delete file after download
      fs.unlink(filePath, () => {});
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error generating PDF",
      error: error.message,
    });
  }
};