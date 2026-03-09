const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const gameRoutes = require('./gameRoutes');
const questionRoutes = require('./questionRoutes');
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/games', gameRoutes);
router.use('/questions', questionRoutes);
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'ScienceBowlOne API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});
module.exports = router;
