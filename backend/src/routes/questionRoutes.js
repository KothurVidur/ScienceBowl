const express = require('express');
const router = express.Router();
const {
  protect
} = require('../middleware/auth');
const {
  getQuestionStats,
  getPracticeQuestion,
  checkPracticeAnswer,
  getCategories,
  reportQuestion
} = require('../controllers/questionController');
router.get('/stats', getQuestionStats);
router.get('/practice', getPracticeQuestion);
router.post('/:id/check', checkPracticeAnswer);
router.post('/:id/report', protect, reportQuestion);
router.get('/categories', getCategories);
module.exports = router;
