import crypto from "crypto";
import User from "../model/user.model.js";
import Hiring from "../model/hiring.js";
import cloudinary from "../utils/cloudinary.js";
import { resolveOrgAdminId } from "../utils/teamScope.js";
import { sendEmail } from "../utils/mailService/sendMail.js";
import { hiringStatusTemplate } from "../utils/mailService/hiringStatusTemplate.js";

export const createHiring = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      currentSalary,
      expectedSalary,
      noticePeriod,
      skills,
      status,
      experience,
      linkedInProfile,
      gitHubLink,
      portfolioLink,
      note,
    } = req.body;

    const existingHiring = await Hiring.findOne({ email });
    if (existingHiring) {
      if (req.file?.filename) {
        cloudinary.uploader.destroy(req.file.filename).catch(() => {});
      }
      return res.status(400).json({
        success: false,
        message: "Hiring already exists with this email",
      });
    }

    const userId = req.user?._id;
    const orgContext = req.query.orgContext ?? null;
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Resume file is required",
      });
    }

    const resumeUrl = req.file.path;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const hiring = await Hiring.create({
      user: userId,
      orgAdmin,
      name,
      email,
      phone,
      resume: resumeUrl,
      currentSalary,
      expectedSalary,
      noticePeriod,
      skills: skills ? skills.split(",") : [],
      experience,
      linkedInProfile,
      gitHubLink,
      portfolioLink,
      status,
      note,
    });

    return res.status(201).json({
      success: true,
      message: "Hiring created successfully",
      hiring,
    });
  } catch (error) {
    console.error("Error creating hiring:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating hiring",
      error: error.message,
    });
  }
};

export const getAllHirings = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const orgContext = req.query.orgContext ?? null;

  try {
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    // super-admin gets all; everyone else scoped to their org
    const filter = orgAdmin ? { orgAdmin } : {};

    const total = await Hiring.countDocuments(filter);
    const hiring = await Hiring.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    const totalPages = Math.ceil(total / limit);
    const currentPage = page;
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;
    const nextPage = hasNextPage ? page + 1 : null;
    const previousPage = hasPreviousPage ? page - 1 : null;

    return res.status(200).json({
      success: true,
      message: "All hiring details fetched successfully",
      hiring,
      totalHirings: total,
      totalPages,
      currentPage,
      hasNextPage,
      hasPreviousPage,
      nextPage,
      previousPage,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error getting all hiring details",
      error: error.message,
    });
  }
};

export const getHiringById = async (req, res) => {
  const hiringId = req.params.id;
  const orgContext = req.query.orgContext ?? null;

  try {
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const hiring = await Hiring.findById(hiringId);
    if (!hiring) {
      return res.status(404).json({
        success: false,
        message: "Hiring detail not found",
      });
    }

    if (orgAdmin && hiring.orgAdmin?.toString() !== orgAdmin.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    return res.status(200).json({
      success: true,
      message: "Hiring detail fetched successfully",
      hiring,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed hiring details",
      error: error.message,
    });
  }
};

export const updateHiring = async (req, res) => {
  const hiringId = req.params.id;
  const orgContext = req.query.orgContext ?? null;
  const {
    name,
    email,
    phone,
    currentSalary,
    expectedSalary,
    noticePeriod,
    skills,
    status,
    experience,
    linkedInProfile,
    gitHubLink,
    portfolioLink,
    note,
  } = req.body;

  try {
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const existing = await Hiring.findById(hiringId).select("orgAdmin");
    if (!existing) {
      return res.status(404).json({ success: false, message: "Hiring data not found" });
    }
    if (orgAdmin && existing.orgAdmin?.toString() !== orgAdmin.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const hiring = await Hiring.findByIdAndUpdate(
      hiringId,
      {
        name,
        email,
        phone,
        currentSalary,
        expectedSalary,
        noticePeriod,
        skills,
        status,
        experience,
        linkedInProfile,
        gitHubLink,
        portfolioLink,
        note,
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Hiring data updated successfully",
      hiring,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error getting updated hiring data",
      error: error.message,
    });
  }
};

export const deleteHiring = async (req, res) => {
  const hiringId = req.params.id;
  const orgContext = req.query.orgContext ?? null;

  try {
    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const existing = await Hiring.findById(hiringId).select("orgAdmin");
    if (!existing) {
      return res.status(404).json({ success: false, message: "Hiring data not found" });
    }
    if (orgAdmin && existing.orgAdmin?.toString() !== orgAdmin.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    await Hiring.findByIdAndDelete(hiringId);
    return res.status(200).json({ success: true, message: "Hiring data deleted successfully" });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed hiring details",
      error: error.message,
    });
  }
};

export const updateStage = async (req, res) => {
  const { id } = req.params;
  const { stage } = req.body;
  const orgContext = req.query.orgContext ?? null;
  const validStages = ["applied", "screening", "interview_scheduled", "offer", "hired", "rejected"];

  try {
    if (!validStages.includes(stage)) {
      return res.status(400).json({ success: false, message: "Invalid stage value" });
    }

    const orgAdmin = resolveOrgAdminId(req.user, orgContext);
    const hiring = await Hiring.findById(id);
    if (!hiring) {
      return res.status(404).json({ success: false, message: "Applicant not found" });
    }
    if (orgAdmin && hiring.orgAdmin?.toString() !== orgAdmin.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    hiring.stage = stage;
    if (stage === "hired") hiring.status = "hired";
    if (stage === "rejected") hiring.status = "rejected";
    await hiring.save();

    if (stage === "offer") {
      const html = hiringStatusTemplate({ name: hiring.name, status: "offer" });
      await sendEmail(hiring.email, "Job Offer — Congratulations!", html).catch(() => {});
    } else if (stage === "rejected") {
      const html = hiringStatusTemplate({ name: hiring.name, status: "rejected" });
      await sendEmail(hiring.email, "Your Application Status", html).catch(() => {});
    }

    return res.status(200).json({ success: true, hiring });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const convertToUser = async (req, res) => {
  const { id } = req.params;
  try {
    const hiring = await Hiring.findById(id);
    if (!hiring) {
      return res.status(404).json({ success: false, message: "Applicant not found" });
    }
    if (hiring.stage !== "hired") {
      return res.status(400).json({
        success: false,
        message: "Applicant must be in 'hired' stage before converting to user",
      });
    }

    const existing = await User.findOne({ email: hiring.email });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists",
      });
    }

    const orgAdminId = resolveOrgAdminId(req.user);
    const tempPassword = crypto.randomBytes(8).toString("hex");

    const user = await User.create({
      name: hiring.name,
      email: hiring.email,
      password: tempPassword,
      role: ["employee"],
      managedBy: orgAdminId ?? null,
      phone: hiring.phone || null,
      isEmailVerified: true,
    });

    const html = hiringStatusTemplate({
      name: hiring.name,
      status: "hired",
      email: hiring.email,
      tempPassword,
    });
    await sendEmail(hiring.email, "Welcome to the team!", html).catch(() => {});

    return res.status(201).json({
      success: true,
      message: "User account created successfully",
      user: { _id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
