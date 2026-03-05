const User = require('../models/User');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../services/emailService');
const {
  normalizeEmail,
  isEmailSyntaxValid,
  isEmailDeliverable
} = require('../utils/emailValidation');

const register = asyncHandler(async (req, res) => {
  const { username, email, password, displayName } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!isEmailSyntaxValid(normalizedEmail)) {
    throw new ApiError('Please provide a valid email', 400);
  }

  const emailIsDeliverable = await isEmailDeliverable(normalizedEmail);
  if (!emailIsDeliverable) {
    throw new ApiError('Please provide a real email address', 400);
  }

  const existingUser = await User.findOne({ $or: [{ email: normalizedEmail }, { username }] });

  if (existingUser) {
    if (existingUser.email === normalizedEmail) {
      throw new ApiError('Email already registered', 400);
    }
    throw new ApiError('Username already taken', 400);
  }

  const user = await User.create({
    username,
    email: normalizedEmail,
    password,
    displayName: displayName || username
  });

  const token = user.generateAuthToken();

  res.status(201).json({
    success: true,
    data: { token, user: user.getPublicProfile() }
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);
  if (!isEmailSyntaxValid(normalizedEmail)) {
    throw new ApiError('Please provide a valid email', 400);
  }
  const emailIsDeliverable = await isEmailDeliverable(normalizedEmail);
  if (!emailIsDeliverable) {
    throw new ApiError('Please provide a real email address', 400);
  }

  const user = await User.findOne({ email: normalizedEmail }).select('+password');

  if (!user) {
    throw new ApiError('Invalid credentials', 401);
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    throw new ApiError('Invalid credentials', 401);
  }

  if (!user.isActive) {
    throw new ApiError('Account is deactivated', 401);
  }

  user.lastLogin = new Date();
  user.lastActive = new Date();
  await user.save({ validateBeforeSave: false });

  const token = user.generateAuthToken();

  res.json({
    success: true,
    data: { token, user: user.getPublicProfile() }
  });
});

const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  res.json({
    success: true,
    data: { user: user.getPublicProfile() }
  });
});

const logout = asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+password');
  const isMatch = await user.comparePassword(currentPassword);

  if (!isMatch) {
    throw new ApiError('Current password is incorrect', 400);
  }

  user.password = newPassword;
  await user.save();

  const token = user.generateAuthToken();

  res.json({
    success: true,
    message: 'Password updated successfully',
    data: { token }
  });
});

const refreshToken = asyncHandler(async (req, res) => {
  const token = req.user.generateAuthToken();

  res.json({ success: true, data: { token } });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = normalizeEmail(email);

  const user = await User.findOne({ email: normalizedEmail });

  if (user) {
    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const hashedResetToken = crypto
      .createHash('sha256')
      .update(rawResetToken)
      .digest('hex');

    user.passwordResetToken = hashedResetToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendBaseUrl}/reset-password/${rawResetToken}`;

    const emailResult = await sendPasswordResetEmail({
      toEmail: normalizedEmail,
      username: user.displayName || user.username,
      resetUrl
    });

    const shouldExposeDevLink = process.env.NODE_ENV !== 'production' && !emailResult.sent;
    if (shouldExposeDevLink) {
      console.log(`[Auth] Password reset link for ${normalizedEmail}: ${resetUrl}`);
      console.log(`[Auth] Email delivery fallback reason: ${emailResult.reason}`);
    }

    res.json({
      success: true,
      message: 'If an account exists for that email, a password reset link has been sent.',
      data: {
        emailSent: emailResult.sent,
        deliveryStatus: emailResult.sent ? 'sent' : 'fallback',
        ...(shouldExposeDevLink ? { resetUrl, deliveryReason: emailResult.reason } : {})
      }
    });
    return;
  }

  res.json({
    success: true,
    message: 'If an account exists for that email, a password reset link has been sent.'
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const hashedResetToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedResetToken,
    passwordResetExpires: { $gt: new Date() }
  }).select('+passwordResetToken +passwordResetExpires');

  if (!user) {
    throw new ApiError('Reset link is invalid or has expired', 400);
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.json({
    success: true,
    message: 'Password has been reset successfully. Please log in with your new password.'
  });
});

module.exports = {
  register,
  login,
  getMe,
  logout,
  changePassword,
  refreshToken,
  forgotPassword,
  resetPassword
};
