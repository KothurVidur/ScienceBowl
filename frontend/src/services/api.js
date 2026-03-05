/**
 * ============================================================================
 * API.JS - HTTP CLIENT CONFIGURATION
 * ============================================================================
 * 
 * This file sets up Axios, an HTTP client library for making API requests.
 * 
 * WHY AXIOS OVER FETCH?
 * - Automatic JSON transformation
 * - Request/response interceptors
 * - Better error handling
 * - Timeout support
 * - Request cancellation
 * 
 * WHAT THIS FILE DOES:
 * 1. Creates a configured Axios instance
 * 2. Automatically adds auth token to requests
 * 3. Handles common error scenarios (401)
 * 4. Exports API method collections for each feature
 * 
 * ============================================================================
 */

import axios from 'axios';

/**
 * ENVIRONMENT VARIABLES
 * 
 * Vite exposes env variables from .env file via import.meta.env
 * Variables must be prefixed with VITE_ to be included in the build.
 * 
 * Example .env:
 *   VITE_API_URL=http://localhost:5000/api
 * 
 * Fallback to '/api' for production (Nginx proxies /api to backend)
 */
const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * CREATE AXIOS INSTANCE
 * 
 * axios.create() creates a custom instance with specific config.
 * All requests made with this instance inherit these settings.
 * 
 * Configuration:
 * - baseURL: Prefix for all requests ('/auth/login' → '/api/auth/login')
 * - headers: Default headers for all requests
 * - timeout: Abort request if it takes longer (ms)
 */
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'  // We're sending JSON data
  },
  timeout: 10000  // 10 seconds
});

/**
 * ============================================================================
 * INTERCEPTORS
 * ============================================================================
 * 
 * Interceptors are functions that run before/after requests/responses.
 * They're perfect for:
 * - Adding auth headers to every request
 * - Logging
 * - Error handling
 * - Transforming data
 * 
 * REQUEST INTERCEPTORS: Run before request is sent
 * RESPONSE INTERCEPTORS: Run after response is received
 */

/**
 * REQUEST INTERCEPTOR - Add Authentication Token
 * 
 * This runs before EVERY request made with our api instance.
 * It reads the token from localStorage and adds it to headers.
 * 
 * interceptors.request.use(onFulfilled, onRejected)
 * - onFulfilled: Called before request is sent
 * - onRejected: Called if request preparation fails
 */
api.interceptors.request.use(
  (config) => {
    /**
     * Get token from localStorage.
     * We check localStorage (not Context) because this file
     * runs outside React components.
     */
    const token = localStorage.getItem('token');
    if (token) {
      /**
       * AUTHORIZATION HEADER
       * 
       * Standard format: "Bearer <token>"
       * "Bearer" indicates the authentication scheme.
       * The backend extracts the token after "Bearer ".
       */
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    // Request preparation failed
    return Promise.reject(error);
  }
);

/**
 * RESPONSE INTERCEPTOR - Handle Errors
 * 
 * This runs after EVERY response (success or error).
 * 
 * interceptors.response.use(onFulfilled, onRejected)
 * - onFulfilled: Called for successful responses (2xx status)
 * - onRejected: Called for error responses (4xx, 5xx)
 */
api.interceptors.response.use(
  (response) => response,  // Success - just return response as-is
  (error) => {
    /**
     * HANDLE 401 UNAUTHORIZED
     * 
     * 401 means:
     * - Token is invalid
     * - Token has expired
     * - No token provided
     * 
     * We clear the token and redirect to login.
     * This logs the user out automatically.
     */
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      
      // Don't redirect if already on auth pages
      if (currentPath !== '/login' && currentPath !== '/register') {
        localStorage.removeItem('token');
        window.location.href = '/login';  // Full page redirect
      }
    }
    
    // Re-throw error so calling code can handle it
    return Promise.reject(error);
  }
);

/**
 * EXPORT DEFAULT INSTANCE
 * 
 * Components can import and use directly:
 *   import api from '../services/api';
 *   const response = await api.get('/users');
 */
export default api;

/**
 * ============================================================================
 * API METHOD COLLECTIONS
 * ============================================================================
 * 
 * We organize API calls into collections by feature.
 * This provides:
 * - Centralized endpoint definitions
 * - Type-ahead in IDE (authAPI.login vs api.post('/auth/login'))
 * - Easy to find and update endpoints
 * - DRY principle (define endpoints once)
 * 
 * USAGE:
 *   import { authAPI, userAPI } from '../services/api';
 *   
 *   const response = await authAPI.login({ email, password });
 *   const profile = await userAPI.getProfile('john');
 */

/**
 * AUTH API - Authentication endpoints
 */
export const authAPI = {
  /**
   * POST /api/auth/register
   * Create a new user account
   */
  register: (data) => api.post('/auth/register', data),
  
  /**
   * POST /api/auth/login
   * Authenticate and get token
   */
  login: (data) => api.post('/auth/login', data),
  
  /**
   * GET /api/auth/me
   * Get current user's profile
   */
  getMe: () => api.get('/auth/me'),
  
  /**
   * PUT /api/auth/password
   * Change password
   */
  changePassword: (data) => api.put('/auth/password', data),
  
  /**
   * POST /api/auth/forgot-password
   * Request password reset link
   */
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  
  /**
   * POST /api/auth/reset-password/:token
   * Reset password with one-time token
   */
  resetPassword: (token, data) => api.post(`/auth/reset-password/${token}`, data)
};

/**
 * USER API - User profile and data endpoints
 */
export const userAPI = {
  /**
   * GET /api/users/:username
   * Get public profile by username
   */
  getProfile: (username) => api.get(`/users/${username}`),
  
  /**
   * PUT /api/users/profile
   * Update own profile
   */
  updateProfile: (data) => api.put('/users/profile', data),
  
  /**
   * GET /api/users/:username/games
   * Get user's game history (paginated)
   */
  getGames: (username, options = {}) => {
    const normalizedOptions = typeof options === 'number' ? { page: options } : options;
    const { page = 1, limit } = normalizedOptions;
    const params = new URLSearchParams({ page: String(page) });
    if (limit !== undefined && limit !== null) params.set('limit', String(limit));
    return api.get(`/users/${username}/games?${params.toString()}`);
  },
  
  /**
   * GET /api/users/:username/rating-history
   * Get rating changes over time (for charts)
   */
  getRatingHistory: (username, days = 30) => api.get(`/users/${username}/rating-history?days=${days}`),
  
  /**
   * GET /api/users/:username/stats
   * Get detailed statistics
   */
  getStats: (username) => api.get(`/users/${username}/stats`),
  
  /**
   * GET /api/users/leaderboard
   * Get global rankings
   * 
   * params can include: sortBy, limit, page
   */
  getLeaderboard: (params = {}) => api.get('/users/leaderboard', { params }),
  
  /**
   * GET /api/users/search?q=query
   * Search for users by username
   */
  searchUsers: (query) => api.get(`/users/search?q=${query}`)
};

/**
 * GAME API - Game management endpoints
 */
export const gameAPI = {
  /**
   * POST /api/games
   * Create a new game
   * 
   * data: { gameType: 'ranked' | 'unranked_1v1' | 'ai' | 'practice', aiDifficulty?: string }
   */
  create: (data) => api.post('/games', data),
  
  /**
   * GET /api/games/code/:code
   * Get game by game code (for joining)
   */
  getByCode: (code) => api.get(`/games/code/${code}`),
  
  /**
   * GET /api/games/:id
   * Get game by MongoDB ID (for history)
   */
  getById: (id) => api.get(`/games/${id}`),
  
  /**
   * POST /api/games/:code/join
   * Join an existing game
   */
  join: (code) => api.post(`/games/${code}/join`),
  
  /**
   * GET /api/games/:id/current-question
   * Get current question in active game
   */
  getCurrentQuestion: (id) => api.get(`/games/${id}/current-question`),

  /**
   * GET /api/games/:id/review
   * Get full post-game question-by-question review
   */
  getReview: (id) => api.get(`/games/${id}/review`),

  /**
   * POST /api/games/:id/review/protest-vote
   * Submit accept/reject vote for a protested review question
   */
  voteReviewProtest: (id, payload) => api.post(`/games/${id}/review/protest-vote`, payload),

  /**
   * POST /api/games/:id/review/forfeit
   * Forfeit unresolved protests when leaving review early
   */
  forfeitReviewProtests: (id) => api.post(`/games/${id}/review/forfeit`),
  
  /**
   * GET /api/games/stats
   * Get overall game statistics
   */
  getStats: () => api.get('/games/stats'),
  
  /**
   * POST /api/games/:id/cancel
   * Cancel a pending game
   */
  cancel: (id) => api.post(`/games/${id}/cancel`),
  
  /**
   * GET /api/games/user/active
   * Get user's currently active game (if any)
   */
  getActive: () => api.get('/games/user/active')
};

/**
 * QUESTION API - Question and practice endpoints
 */
export const questionAPI = {
  /**
   * GET /api/questions/stats
   * Get statistics about question database
   */
  getStats: () => api.get('/questions/stats'),
  
  /**
   * GET /api/questions/practice
   * Get random questions for practice mode
   * 
   * params: { category?, difficulty?, limit? }
   */
  getPractice: (params = {}) => api.get('/questions/practice', { params }),
  
  /**
   * POST /api/questions/:id/check
   * Check if answer is correct (for practice)
   */
  checkAnswer: (id, answer) => api.post(`/questions/${id}/check`, { answer }),

  /**
   * POST /api/questions/:id/report
   * Add question to the reported collection (deduplicated by questionId)
   */
  report: (id) => api.post(`/questions/${id}/report`),
  
  /**
   * GET /api/questions/categories
   * Get list of available categories
   */
  getCategories: () => api.get('/questions/categories')
};
