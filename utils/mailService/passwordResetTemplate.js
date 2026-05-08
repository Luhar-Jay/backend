const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const passwordResetTemplate = ({
  name = "there",
  resetUrl = "",
  expiryMinutes = 15,
  appName = "CRM",
}) => {
  const safeName = escapeHtml(name);
  const safeResetUrl = escapeHtml(resetUrl);
  const safeExpiry = escapeHtml(expiryMinutes);
  const safeAppName = escapeHtml(appName);

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset Your Password</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="background:#111827;color:#ffffff;padding:20px 24px;">
                <h1 style="margin:0;font-size:20px;line-height:28px;">Reset Your Password</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 12px;font-size:14px;line-height:22px;">Hi ${safeName},</p>
                <p style="margin:0 0 16px;font-size:14px;line-height:22px;">
                  We received a request to reset the password for your account.
                  Click the button below to choose a new password.
                </p>

                ${
                  resetUrl
                    ? `<p style="margin:0 0 18px;">
                        <a href="${safeResetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:10px 16px;border-radius:6px;">
                          Reset Password
                        </a>
                      </p>`
                    : ""
                }

                <p style="margin:0 0 12px;font-size:13px;line-height:20px;color:#374151;">
                  This link expires in <strong>${safeExpiry} minutes</strong>.
                </p>
                <p style="margin:0;font-size:13px;line-height:20px;color:#6b7280;">
                  If you did not request a password reset, you can safely ignore this email.
                  Your password will not change.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;line-height:18px;">
                ${safeAppName} &mdash; This link can only be used once.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
};
