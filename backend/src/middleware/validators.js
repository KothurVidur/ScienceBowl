const {
  body,
  query,
  validationResult
} = require('express-validator');
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      errors: errors.array().map(e => ({
        field: e.path,
        message: e.msg
      }))
    });
  }
  next();
};
const registerValidator = [body('username').trim().isLength({
  min: 3,
  max: 20
}).withMessage('Username must be 3-20 characters').matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'), body('email').trim().isEmail({
  allow_display_name: false,
  require_tld: true
}).withMessage('Please provide a valid email').normalizeEmail(), body('password').isLength({
  min: 8
}).withMessage('Password must be at least 8 characters').matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'), validate];
const loginValidator = [body('email').trim().isEmail({
  allow_display_name: false,
  require_tld: true
}).withMessage('Please provide a valid email').normalizeEmail(), body('password').notEmpty().withMessage('Password is required'), validate];
const forgotPasswordValidator = [body('email').trim().isEmail({
  allow_display_name: false,
  require_tld: true
}).withMessage('Please provide a valid email').normalizeEmail(), validate];
const resetPasswordValidator = [body('password').isLength({
  min: 8
}).withMessage('Password must be at least 8 characters').matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'), validate];
const updateProfileValidator = [body('displayName').optional().trim().isLength({
  max: 50
}).withMessage('Display name cannot exceed 50 characters'), body('bio').optional().trim().isLength({
  max: 500
}).withMessage('Bio cannot exceed 500 characters'), body('avatar').optional().trim(), validate];
const changePasswordValidator = [body('currentPassword').notEmpty().withMessage('Current password is required'), body('newPassword').isLength({
  min: 8
}).withMessage('New password must be at least 8 characters').matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'), validate];
const createGameValidator = [body('gameType').isIn(['ranked', 'ai', 'practice', 'unranked_1v1']).withMessage('Invalid game type'), body('aiDifficulty').optional().isIn(['easy', 'medium', 'hard', 'expert']).withMessage('Invalid AI difficulty'), body('categories').optional().isArray().withMessage('Categories must be an array'), validate];
const submitAnswerValidator = [body('answer').trim().notEmpty().withMessage('Answer is required'), body('responseTime').isNumeric().withMessage('Response time must be a number'), validate];
const paginationValidator = [query('page').optional().isInt({
  min: 1
}).withMessage('Page must be a positive integer'), query('limit').optional().custom(value => {
  if (value === undefined || value === null || value === '') return true;
  if (String(value).toLowerCase() === 'all') return true;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 5000;
}).withMessage('Limit must be "all" or an integer between 1 and 5000'), validate];
const leaderboardValidator = [query('limit').optional().isInt({
  min: 1,
  max: 100
}).withMessage('Limit must be between 1 and 100'), query('category').optional().isIn(['biology', 'chemistry', 'physics', 'mathematics', 'math', 'earth and space', 'earth-space', 'energy', 'other', 'Biology', 'Chemistry', 'Physics', 'Mathematics', 'Earth and Space', 'Energy', 'Other']).withMessage('Invalid category'), validate];
module.exports = {
  validate,
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  updateProfileValidator,
  changePasswordValidator,
  createGameValidator,
  submitAnswerValidator,
  paginationValidator,
  leaderboardValidator
};
