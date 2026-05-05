import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (to, subject, html) => {
  const from =
    process.env.EMAIL_FROM ||
    `CRM <${process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"}>`;

  const { data, error } = await resend.emails.send({ from, to, subject, html });

  if (error) {
    console.error("Resend error sending email", error);
    throw new Error(error.message ?? "Failed to send email");
  }

  console.log("Email sent via Resend", { id: data?.id, to, subject });
};
