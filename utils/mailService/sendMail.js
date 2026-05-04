import nodemailer from "nodemailer";

/**
 * Build SMTP transport. Supports Gmail (465/587), Mailtrap sandbox (2525/587), and generic hosts.
 */
function createTransport() {
  const host = process.env.EMAIL_HOST || "smtp.gmail.com";
  const port = Number(process.env.EMAIL_PORT || 587);
  const user = process.env.EMAIL_USER;
  // Gmail App Passwords are shown with spaces for readability — strip them
  const pass = (process.env.EMAIL_PASS || "").replace(/\s+/g, "");

  if (!user || !pass) {
    throw new Error("EMAIL_USER and EMAIL_PASS are required in .env");
  }

  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    // 587 expects STARTTLS; 2525 (Mailtrap) usually works without forcing requireTLS
    ...(port === 587 ? { requireTLS: true } : {}),
    tls: {
      minVersion: "TLSv1.2",
    },
  });
}

export const sendEmail = async (to, subject, html) => {
  const transporter = createTransport();

  try {
    const user = process.env.EMAIL_USER;
    const from =
      process.env.EMAIL_FROM || `Task Management System <${user}>`;

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });

    const accepted = Array.isArray(info.accepted) ? info.accepted : [];
    const rejected = Array.isArray(info.rejected) ? info.rejected : [];
    if (accepted.length === 0 && rejected.length > 0) {
      const err = new Error(
        "SMTP rejected all recipients — check address format and SMTP settings"
      );
      err.rejected = rejected;
      err.response = info.response;
      throw err;
    }

    const host = process.env.EMAIL_HOST || "";
    if (host.includes("mailtrap")) {
      console.log("Email accepted by Mailtrap (sandbox — open https://mailtrap.io inboxes, not your real mailbox)", {
        to,
        messageId: info.messageId,
      });
    } else {
      console.log("Email sent successfully", {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
      });
    }
  } catch (error) {
    console.error("Error sending email", error);
    throw error;
  }
};
