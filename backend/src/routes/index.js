/**
 * ============================================================================
 * ROUTES/INDEX.JS - MAIN API ROUTER
 * ============================================================================
 * 
 * WHAT IS ROUTING?
 * Routing determines what code runs when a specific URL is accessed.
 * Example: When someone visits /api/auth/login, run the login function.
 * 
 * EXPRESS ROUTING HIERARCHY:
 * This file creates a "main router" that organizes all routes.
 * 
 * In server.js:   app.use('/api', routes)        → Everything starts with /api
 * In this file:   router.use('/auth', authRoutes) → /api/auth/...
 * In authRoutes:  router.post('/login', ...)      → /api/auth/login
 * 
 * BENEFITS OF ORGANIZED ROUTING:
 * 1. Code organization - each feature has its own file
 * 2. Easier to find and modify routes
 * 3. Can apply middleware to groups of routes
 * 4. Team members can work on different route files
 * 
 * ============================================================================
 */

const express = require('express');

/**
 * CREATE A ROUTER INSTANCE
 * 
 * express.Router() creates a modular, mountable route handler.
 * Think of it as a "mini-app" that handles a subset of routes.
 * 
 * Unlike app (from express()), a router can be mounted at specific paths.
 */
const router = express.Router();

/**
 * IMPORT ROUTE MODULES
 * 
 * Each feature (auth, users, games, questions) has its own route file.
 * This is the MODULAR ARCHITECTURE pattern - separate concerns into files.
 */
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const gameRoutes = require('./gameRoutes');
const questionRoutes = require('./questionRoutes');

/**
 * ============================================================================
 * MOUNT ROUTES
 * ============================================================================
 * 
 * router.use() "mounts" another router at a specific path.
 * 
 * MOUNTING EXPLAINED:
 * router.use('/auth', authRoutes) means:
 * "For any request starting with /auth, hand it off to authRoutes"
 * 
 * Combined with app.use('/api', routes) in server.js:
 * - /api/auth/login    → authRoutes handles 'login'
 * - /api/users/profile → userRoutes handles 'profile'
 * - /api/games/create  → gameRoutes handles 'create'
 * 
 * URL STRUCTURE BEST PRACTICES (REST API):
 * - Use nouns, not verbs: /users not /getUsers
 * - Use plural: /users not /user
 * - Use HTTP methods for actions:
 *   - GET /users      → List all users
 *   - POST /users     → Create a user
 *   - GET /users/:id  → Get one user
 *   - PUT /users/:id  → Update a user
 *   - DELETE /users/:id → Delete a user
 */
router.use('/auth', authRoutes);      // /api/auth/...
router.use('/users', userRoutes);     // /api/users/...
router.use('/games', gameRoutes);     // /api/games/...
router.use('/questions', questionRoutes);  // /api/questions/...

/**
 * HEALTH CHECK ENDPOINT
 * 
 * A simple endpoint that returns "OK" if the API is running.
 * 
 * PRODUCTION USES:
 * - Load balancers check this to know if server is healthy
 * - Docker HEALTHCHECK command pings this endpoint
 * - Monitoring tools (Uptime Robot, Pingdom) watch this
 * - Kubernetes readiness/liveness probes use this
 * 
 * This endpoint should:
 * - Be fast (no database queries if possible)
 * - Always succeed if the app is running
 * - Include useful debugging info (timestamp, environment)
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Science Bowl Online API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

module.exports = router;
