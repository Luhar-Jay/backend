/**
 * @param {{ name: string, status: 'offer'|'rejected'|'hired', email?: string, tempPassword?: string }} opts
 */
export function hiringStatusTemplate({ name, status, email, tempPassword }) {
  const n = String(name).replace(/</g, "&lt;");

  if (status === "offer") {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Job Offer</title></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#111;">
  <h2 style="color:#16a34a;">Congratulations, ${n}!</h2>
  <p>We are pleased to extend a formal job offer to you. Our team was impressed with your profile and we'd love to have you join us.</p>
  <p>Please reply to this email or contact HR to discuss the offer details and next steps.</p>
  <p style="color:#555;font-size:0.9rem;">If you have any questions, don't hesitate to reach out.</p>
</body></html>`;
  }

  if (status === "rejected") {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Application Update</title></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#111;">
  <h2>Hi ${n},</h2>
  <p>Thank you for taking the time to apply and for your interest in joining our team.</p>
  <p>After careful consideration, we have decided to move forward with other candidates at this time. We appreciate your effort and encourage you to apply for future openings.</p>
  <p style="color:#555;font-size:0.9rem;">We wish you the very best in your job search.</p>
</body></html>`;
  }

  if (status === "hired") {
    const e = String(email || "").replace(/</g, "&lt;");
    const p = String(tempPassword || "").replace(/</g, "&lt;");
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Welcome to the Team</title></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#111;">
  <h2 style="color:#2563eb;">Welcome aboard, ${n}!</h2>
  <p>Your account has been created. Use the credentials below to sign in for the first time.</p>
  <table style="border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Email</td><td>${e}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Temporary password</td><td style="font-family:monospace;background:#f3f4f6;padding:2px 8px;border-radius:4px;">${p}</td></tr>
  </table>
  <p style="color:#dc2626;font-size:0.9rem;">Please change your password immediately after your first login.</p>
</body></html>`;
  }

  return "";
}
