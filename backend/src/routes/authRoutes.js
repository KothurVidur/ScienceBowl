/**
 * ============================================================================
 * AUTHROUTES.JS - AUTHENTICATION ROUTES
 * ============================================================================
 * 
 * This file defines all authentication-related API endpoints:
 * - POST /api/auth/register - Create a new account
 * - POST /api/auth/login    - Log in and get a token
 * - POST /api/auth/forgot-password - Request reset link
 * - POST /api/auth/reset-password/:token - Reset password
 * - GET  /api/auth/me       - Get current user's info
 * - POST /api/auth/logout   - Invalidate token
 * - PUT  /api/auth/password - Change password
 * - POST /api/auth/refresh  - Get a new token
 * 
 * ROUTE DEFINITION PATTERN:
 * router.METHOD(PATH, ...MIDDLEWARE, HANDLER)
 * 
 * - METHOD: HTTP method (get, post, put, delete, patch)
 * - PATH: URL path (relative to where this router is mounted)
 * - MIDDLEWARE: Optional functions that run before the handler
 * - HANDLER: The final function that handles the request
 * 
 * MIDDLEWARE CHAINING:
 * Multiple middleware can be added in sequence. Each must call next()
 * to continue, or send a response to end the chain.
 * 
 * Example: router.post('/register', validator, register)
 * 1. Request comes in
 * 2. validator middleware runs → validates input
 * 3. If invalid, validator sends error response (chain ends)
 * 4. If valid, validator calls next()
 * 5. register handler runs → creates user, sends response
 * 
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

// Import authentication middleware
const { protect } = require('../middleware/auth');

// Import validation middleware for input validation
const { 
  registerValidator, 
  loginValidator, 
  changePasswordValidator,
  forgotPasswordValidator,
  resetPasswordValidator
} = require('../middleware/validators');

// Import controller functions (the actual logic)
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

/**
 * ============================================================================
 * PUBLIC ROUTES (No authentication required)
 * ============================================================================
 * 
 * These routes are accessible to anyone, even without logging in.
 * They're used to create accounts and authenticate users.
 */

/**
 * @route   POST /api/auth/register
 * @desc    Create a new user account
 * @access  Public
 * 
 * MIDDLEWARE CHAIN:
 * 1. registerValidator - Checks that username, email, password are valid
 * 2. register - Creates the user in database, returns JWT
 * 
 * Request body: { username, email, password }
 * Response: { success: true, token: "jwt...", user: {...} }
 */
router.post('/register', registerValidator, register);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and get token
 * @access  Public
 * 
 * Request body: { email, password }
 * Response: { success: true, token: "jwt...", user: {...} }
 */
router.post('/login', loginValidator, login);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request a password reset link
 * @access  Public
 *
 * Request body: { email }
 */
router.post('/forgot-password', forgotPasswordValidator, forgotPassword);

/**
 * @route   POST /api/auth/reset-password/:token
 * @desc    Reset password with token from reset link
 * @access  Public
 *
 * Request body: { password }
 */
router.post('/reset-password/:token', resetPasswordValidator, resetPassword);

/**
 * ============================================================================
 * PROTECTED ROUTES (Authentication required)
 * ============================================================================
 * 
 * These routes require a valid JWT token.
 * The 'protect' middleware runs first and:
 * - Verifies the token
 * - Attaches user info to req.user
 * - If invalid, returns 401 error (never reaches the handler)
 */

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged in user
 * @access  Private (requires token)
 * 
 * WHY THIS ENDPOINT?
 * When a user refreshes the page, the frontend has the token but
 * not the user data. This endpoint fetches the user's current data.
 * 
 * Headers: Authorization: Bearer <token>
 * Response: { success: true, user: {...} }
 */
router.get('/me', protect, getMe);

/**
 * @route   POST /api/auth/logout
 * @desc    Log out user
 * @access  Private
 * 
 * NOTE: With JWT, true "logout" is tricky because tokens are stateless.
 * Options:
 * 1. Client-side only - just delete the token from localStorage
 * 2. Token blacklist - server tracks invalidated tokens (adds state)
 * 3. Short token expiry + refresh tokens
 * 
 * This endpoint mainly exists for the client to confirm logout.
 */
router.post('/logout', protect, logout);

/**
 * @route   PUT /api/auth/password
 * @desc    Change password
 * @access  Private
 * 
 * HTTP METHODS:
 * - PUT: Replace entire resource (idempotent - same result if called multiple times)
 * - PATCH: Partial update
 * - POST: Create new resource (not idempotent)
 * 
 * Request body: { currentPassword, newPassword }
 */
router.put('/password', protect, changePasswordValidator, changePassword);

/**
 * @route   POST /api/auth/refresh
 * @desc    Get a new token (extends session)
 * @access  Private
 * 
 * TOKEN REFRESH PATTERN:
 * JWTs have expiration times (e.g., 7 days).
 * Before expiring, the client can call this to get a fresh token.
 * This keeps users logged in without storing passwords.
 */
router.post('/refresh', protect, refreshToken);

module.exports = router;
