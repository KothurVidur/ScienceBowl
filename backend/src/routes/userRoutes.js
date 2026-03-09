const express = require('express');
const router = express.Router();
const {
  protect
} = require('../middleware/auth');
const {
  updateProfileValidator,
  paginationValidator,
  leaderboardValidator
} = require('../middleware/validators');
const {
  getUserProfile,
  updateProfile,
  getUserGames,
  getUserRatingHistory,
  getLeaderboard,
  searchUsers,
  getUserStats
} = require('../controllers/userController');
router.get('/leaderboard', leaderboardValidator, getLeaderboard);
router.get('/search', searchUsers);
router.get('/:username', getUserProfile);
router.get('/:username/games', paginationValidator, getUserGames);
router.get('/:username/rating-history', getUserRatingHistory);
router.get('/:username/stats', getUserStats);
router.put('/profile', protect, updateProfileValidator, updateProfile);
module.exports = router;
