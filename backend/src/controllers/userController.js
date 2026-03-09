const User = require('../models/User');
const Game = require('../models/Game');
const {
  asyncHandler,
  ApiError
} = require('../middleware/errorHandler');
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    username: req.params.username,
    isActive: true
  });
  if (!user) {
    throw new ApiError('User not found', 404);
  }
  res.json({
    success: true,
    data: {
      user: user.getPublicProfile()
    }
  });
});
const updateProfile = asyncHandler(async (req, res) => {
  const allowedUpdates = ['displayName', 'bio', 'avatar', 'preferences'];
  const updates = {};
  for (const key of allowedUpdates) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }
  const user = await User.findByIdAndUpdate(req.user.id, {
    $set: updates
  }, {
    new: true,
    runValidators: true
  });
  res.json({
    success: true,
    data: {
      user: user.getPublicProfile()
    }
  });
});
const getUserGames = asyncHandler(async (req, res) => {
  const {
    username
  } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limitParam = req.query.limit;
  const parsedLimit = parseInt(limitParam, 10);
  const limit = String(limitParam).toLowerCase() === 'all' ? 5000 : Math.min(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20, 5000);
  const skip = (page - 1) * limit;
  const user = await User.findOne({
    username,
    isActive: true
  });
  if (!user) {
    throw new ApiError('User not found', 404);
  }
  const playerFilter = {
    $or: [{
      'player1.userId': user._id
    }, {
      'player2.userId': user._id
    }],
    status: 'completed'
  };
  const [games, total] = await Promise.all([Game.find(playerFilter).sort({
    createdAt: -1
  }).skip(skip).limit(limit).select('-questions.player1Response.answer -questions.player2Response.answer'), Game.countDocuments(playerFilter)]);
  res.json({
    success: true,
    data: {
      games,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});
const getUserRatingHistory = asyncHandler(async (req, res) => {
  const {
    username
  } = req.params;
  const rawDays = String(req.query.days || '30').toLowerCase();
  const days = rawDays === 'all' || rawDays === 'alltime' ? null : parseInt(rawDays, 10) || 30;
  const user = await User.findOne({
    username,
    isActive: true
  });
  if (!user) {
    throw new ApiError('User not found', 404);
  }
  let history = [...user.ratingHistory].sort((a, b) => a.date - b.date);
  if (days !== null) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    history = history.filter(entry => entry.date >= startDate);
  }
  res.json({
    success: true,
    data: {
      currentRating: user.rating,
      peakRating: user.peakRating,
      history
    }
  });
});
const getLeaderboard = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const page = parseInt(req.query.page) || 1;
  const skip = (page - 1) * limit;
  const sortBy = req.query.sortBy || 'rating';
  let sortField;
  switch (sortBy) {
    case 'gamesWon':
      sortField = {
        'stats.gamesWon': -1
      };
      break;
    case 'gamesPlayed':
      sortField = {
        'stats.gamesPlayed': -1
      };
      break;
    case 'winStreak':
      sortField = {
        'stats.longestWinStreak': -1
      };
      break;
    default:
      sortField = {
        rating: -1
      };
  }
  const leaderboardQuery = {
    isActive: true
  };
  const [users, total] = await Promise.all([User.find(leaderboardQuery).sort(sortField).skip(skip).limit(limit).select('username displayName avatar rating stats.gamesPlayed stats.gamesWon stats.longestWinStreak'), User.countDocuments(leaderboardQuery)]);
  const leaderboard = users.map((user, index) => ({
    rank: skip + index + 1,
    ...user.toObject()
  }));
  res.json({
    success: true,
    data: {
      leaderboard,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});
const searchUsers = asyncHandler(async (req, res) => {
  const {
    q
  } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  if (!q || q.length < 2) {
    return res.json({
      success: true,
      data: {
        users: []
      }
    });
  }
  const users = await User.find({
    isActive: true,
    $or: [{
      username: {
        $regex: q,
        $options: 'i'
      }
    }, {
      displayName: {
        $regex: q,
        $options: 'i'
      }
    }]
  }).limit(limit).select('username displayName avatar rating');
  res.json({
    success: true,
    data: {
      users
    }
  });
});
const getUserStats = asyncHandler(async (req, res) => {
  const {
    username
  } = req.params;
  const user = await User.findOne({
    username,
    isActive: true
  });
  if (!user) {
    throw new ApiError('User not found', 404);
  }
  const winRate = user.stats.gamesPlayed > 0 ? Math.round(user.stats.gamesWon / user.stats.gamesPlayed * 1000) / 10 : 0;
  const accuracy = user.stats.questionsAnswered > 0 ? Math.round(user.stats.questionsCorrect / user.stats.questionsAnswered * 1000) / 10 : 0;
  let bestCategory = null;
  let bestCategoryAccuracy = 0;
  for (const [category, stats] of Object.entries(user.stats.categoryStats)) {
    if (stats.answered >= 10) {
      const catAccuracy = stats.correct / stats.answered * 100;
      if (catAccuracy > bestCategoryAccuracy) {
        bestCategory = category;
        bestCategoryAccuracy = catAccuracy;
      }
    }
  }
  res.json({
    success: true,
    data: {
      username: user.username,
      displayName: user.displayName,
      rating: user.rating,
      peakRating: user.peakRating,
      rankTitle: user.rankTitle,
      stats: {
        ...user.stats.toObject(),
        winRate,
        accuracy,
        bestCategory,
        bestCategoryAccuracy: Math.round(bestCategoryAccuracy * 10) / 10
      },
      memberSince: user.createdAt
    }
  });
});
module.exports = {
  getUserProfile,
  updateProfile,
  getUserGames,
  getUserRatingHistory,
  getLeaderboard,
  searchUsers,
  getUserStats
};
