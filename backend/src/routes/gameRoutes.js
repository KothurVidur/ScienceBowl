const express = require('express');
const router = express.Router();
const {
  protect
} = require('../middleware/auth');
const {
  createGameValidator
} = require('../middleware/validators');
const {
  createGame,
  getGameByCode,
  getGameById,
  joinGame,
  getCurrentQuestion,
  getGameStats,
  cancelGame,
  getActiveGames,
  getGameReview,
  voteGameProtest,
  forfeitReviewProtests
} = require('../controllers/gameController');
router.get('/stats', getGameStats);
router.get('/code/:code', getGameByCode);
router.get('/:id', getGameById);
router.post('/', protect, createGameValidator, createGame);
router.post('/:code/join', protect, joinGame);
router.get('/:id/review', protect, getGameReview);
router.post('/:id/review/protest-vote', protect, voteGameProtest);
router.post('/:id/review/forfeit', protect, forfeitReviewProtests);
router.get('/:id/current-question', protect, getCurrentQuestion);
router.post('/:id/cancel', protect, cancelGame);
router.get('/user/active', protect, getActiveGames);
module.exports = router;
