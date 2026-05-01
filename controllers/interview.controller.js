import Interview from "../model/interview.model.js";
import Hiring from "../model/hiring.js";
import { resolveOrgAdminId } from "../utils/teamScope.js";
import { sendEmail } from "../utils/mailService/sendMail.js";
import { hiringStatusTemplate } from "../utils/mailService/hiringStatusTemplate.js";

export const scheduleInterview = async (req, res) => {
  try {
    const orgAdminId = resolveOrgAdminId(req.user);
    if (!orgAdminId && req.user.role !== "super-admin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { applicantId, scheduledAt, interviewers, notes } = req.body;
    if (!applicantId || !scheduledAt) {
      return res.status(400).json({ success: false, message: "applicantId and scheduledAt are required" });
    }

    const applicant = await Hiring.findById(applicantId);
    if (!applicant) {
      return res.status(404).json({ success: false, message: "Applicant not found" });
    }

    applicant.stage = "interview_scheduled";
    await applicant.save();

    const interview = await Interview.create({
      applicant: applicantId,
      orgAdmin: orgAdminId,
      scheduledAt: new Date(scheduledAt),
      interviewers: interviewers || [],
      notes: notes || "",
    });

    const populated = await Interview.findById(interview._id)
      .populate("applicant", "name email stage")
      .populate("interviewers", "name email");

    return res.status(201).json({ success: true, interview: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getInterviews = async (req, res) => {
  try {
    const orgAdminId = resolveOrgAdminId(req.user);
    const filter = {};

    if (req.user.role !== "super-admin" && orgAdminId) {
      filter.orgAdmin = orgAdminId;
    }
    if (req.query.applicantId) filter.applicant = req.query.applicantId;

    const interviews = await Interview.find(filter)
      .populate("applicant", "name email stage")
      .populate("interviewers", "name email")
      .populate("feedback.interviewer", "name email")
      .sort({ scheduledAt: -1 });

    return res.status(200).json({ success: true, interviews });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getInterviewById = async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id)
      .populate("applicant", "name email phone stage")
      .populate("interviewers", "name email")
      .populate("feedback.interviewer", "name email");

    if (!interview) {
      return res.status(404).json({ success: false, message: "Interview not found" });
    }

    return res.status(200).json({ success: true, interview });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const submitFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, notes, recommendation } = req.body;

    const interview = await Interview.findById(id);
    if (!interview) {
      return res.status(404).json({ success: false, message: "Interview not found" });
    }

    const isInterviewer = interview.interviewers.some(
      (uid) => uid.toString() === req.user._id.toString()
    );
    const role = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
    const isAdmin = ["admin", "hr", "super-admin", "manager"].includes(role);

    if (!isInterviewer && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not an assigned interviewer" });
    }

    const existingIdx = interview.feedback.findIndex(
      (f) => f.interviewer.toString() === req.user._id.toString()
    );

    if (existingIdx >= 0) {
      interview.feedback[existingIdx].rating = rating ?? interview.feedback[existingIdx].rating;
      interview.feedback[existingIdx].notes = notes ?? interview.feedback[existingIdx].notes;
      interview.feedback[existingIdx].recommendation = recommendation ?? interview.feedback[existingIdx].recommendation;
      interview.feedback[existingIdx].submittedAt = new Date();
    } else {
      interview.feedback.push({
        interviewer: req.user._id,
        rating: rating ?? null,
        notes: notes || "",
        recommendation: recommendation || "hold",
        submittedAt: new Date(),
      });
    }

    await interview.save();
    const populated = await Interview.findById(id).populate("feedback.interviewer", "name email");
    return res.status(200).json({ success: true, interview: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const setInterviewResult = async (req, res) => {
  try {
    const { id } = req.params;
    const { result } = req.body;

    if (!["pending", "passed", "failed"].includes(result)) {
      return res.status(400).json({ success: false, message: "result must be pending, passed, or failed" });
    }

    const interview = await Interview.findById(id).populate("applicant");
    if (!interview) {
      return res.status(404).json({ success: false, message: "Interview not found" });
    }

    const orgAdminId = resolveOrgAdminId(req.user);
    if (
      req.user.role !== "super-admin" &&
      interview.orgAdmin?.toString() !== orgAdminId?.toString()
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    interview.result = result;
    await interview.save();

    const applicant = interview.applicant;
    if (result === "passed") {
      applicant.stage = "offer";
      const html = hiringStatusTemplate({ name: applicant.name, status: "offer" });
      await sendEmail(applicant.email, "Job Offer — Congratulations!", html);
    } else if (result === "failed") {
      applicant.stage = "rejected";
      const html = hiringStatusTemplate({ name: applicant.name, status: "rejected" });
      await sendEmail(applicant.email, "Your Application Status", html);
    }
    await applicant.save();

    return res.status(200).json({ success: true, interview });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
