const express = require('express');
const router = express.Router();
const {
  protect
} = require('../middleware/auth');
const {
  registerValidator,
  loginValidator,
  changePasswordValidator,
  forgotPasswordValidator,
  resetPasswordValidator
} = require('../middleware/validators');
const {
  register,
  login,
  getMe,
  logout,
  changePassword,
  refreshToken,
  forgotPassword,
  resetPassword
} = require('../controllers/authController');
router.post('/register', registerValidator, register);
router.post('/login', loginValidator, login);
router.post('/forgot-password', forgotPasswordValidator, forgotPassword);
router.post('/reset-password/:token', resetPasswordValidator, resetPassword);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.put('/password', protect, changePasswordValidator, changePassword);
router.post('/refresh', protect, refreshToken);
module.exports = router;
