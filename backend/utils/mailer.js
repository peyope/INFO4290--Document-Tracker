// backend/utils/mailer.js
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true", // usually false for port 587
  auth: process.env.SMTP_USER
    ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      }
    : undefined,
});

/**
 * Generic helper
 */
async function sendMail({ to, subject, text, html }) {
  if (!to) throw new Error("Missing 'to' email address");

  const from = process.env.FROM_EMAIL || "no-reply@document-tracker.local";

  const mailOptions = {
    from,
    to,
    subject,
    text,
    html,
  };

  await transporter.sendMail(mailOptions);
}

/**
 * Email when an access request is approved.
 * Includes a temporary password the user must change at first login.
 */
export async function sendAccessApprovedEmail({ to, fullName, tempPassword }) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  const name = fullName || "there";

  const subject = "Your access request has been approved";
  const text = [
    `Hello ${name},`,
    "",
    "Your request for access to the Physical Document Tracker has been approved.",
    "",
    `Temporary password: ${tempPassword}`,
    "",
    "You will be asked to change this password the first time you sign in.",
    "",
    `You can log in here: ${appUrl}`,
    "",
    "If you did not request this access, please contact an administrator.",
  ].join("\n");

  const html = `
    <p>Hello ${name},</p>
    <p>Your request for access to the <strong>Physical Document Tracker</strong> has been approved.</p>
    <p>
      <strong>Temporary password:</strong><br/>
      <code style="font-size: 1.1em;">${tempPassword}</code>
    </p>
    <p>You will be required to change this password the first time you sign in.</p>
    <p>
      You can log in here:<br/>
      <a href="${appUrl}" target="_blank" rel="noopener noreferrer">${appUrl}</a>
    </p>
    <p>If you did not request this access, please contact an administrator.</p>
  `;

  await sendMail({ to, subject, text, html });
}

/**
 * Email when an access request is denied.
 */
export async function sendAccessDeniedEmail({ to, fullName }) {
  const name = fullName || "there";

  const subject = "Your access request has been denied";
  const text = [
    `Hello ${name},`,
    "",
    "Thank you for your interest in the Physical Document Tracker.",
    "After review, your access request has been denied.",
    "",
    "If you believe this is an error or you need more information, please contact an administrator.",
  ].join("\n");

  const html = `
    <p>Hello ${name},</p>
    <p>
      Thank you for your interest in the <strong>Physical Document Tracker</strong>.<br/>
      After review, your access request has been <strong>denied</strong>.
    </p>
    <p>If you believe this is an error or you need more information, please contact an administrator.</p>
  `;

  await sendMail({ to, subject, text, html });
}
