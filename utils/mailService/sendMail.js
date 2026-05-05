import nodemailer from "nodemailer";

function createTransport() {
  const host = process.env.EMAIL_HOST || "smtp.gmail.com";
  const port = Number(process.env.EMAIL_PORT || 587);
  const user = process.env.EMAIL_USER;
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
    ...(port === 587 ? { requireTLS: true } : {}),
    tls: { minVersion: "TLSv1.2" },
  });
}

export const sendEmail = async (to, subject, html) => {
  const transporter = createTransport();
  const from = process.env.EMAIL_FROM || `CRM <${process.env.EMAIL_USER}>`;

  const info = await transporter.sendMail({ from, to, subject, html });
  console.log("Email sent", { messageId: info.messageId, to });
};
