let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (err) {
  nodemailer = null;
}
const isSmtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
const createTransporter = () => {
  if (!nodemailer || !isSmtpConfigured()) return null;
  const port = Number(process.env.SMTP_PORT);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};
const sendPasswordResetEmail = async ({
  toEmail,
  username,
  resetUrl
}) => {
  if (!nodemailer) return {
    sent: false,
    reason: 'nodemailer dependency missing'
  };
  if (!isSmtpConfigured()) return {
    sent: false,
    reason: 'smtp not configured'
  };
  const transporter = createTransporter();
  if (!transporter) return {
    sent: false,
    reason: 'smtp transport unavailable'
  };
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; line-height: 1.5;">
      <h2 style="margin-bottom: 12px;">Reset your ScienceBowlOne password</h2>
      <p>Hello ${username || 'there'},</p>
      <p>We received a request to reset your password. This link will expire in 1 hour.</p>
      <p style="margin: 24px 0;">
        <a
          href="${resetUrl}"
          style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block;"
        >
          Reset Password
        </a>
      </p>
      <p>If you did not request this, you can safely ignore this email.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
      <p style="color:#6b7280;font-size:12px;">ScienceBowlOne</p>
    </div>
  `;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: toEmail,
      subject: 'Reset your ScienceBowlOne password',
      html
    });
    return {
      sent: true
    };
  } catch (err) {
    console.error('[Email] Password reset email failed:', err.message);
    return {
      sent: false,
      reason: 'delivery failed'
    };
  }
};
module.exports = {
  isSmtpConfigured,
  sendPasswordResetEmail
};
