const Question = require('../models/Question');
const Reported = require('../models/Reported');
const mongoose = require('mongoose');
const {
  asyncHandler,
  ApiError
} = require('../middleware/errorHandler');
const {
  QUESTION_CATEGORIES,
  normalizeType,
  normalizeCategory,
  normalizeDifficulty,
  difficultyFilterFromInput,
  toRuntimeType,
  toRuntimeFormat,
  getCanonicalAnswer,
  getAlternateAnswers,
  difficultyBand
} = require('../utils/questionSchema');
const getQuestionStats = asyncHandler(async (req, res) => {
  const stats = await Question.aggregate([{
    $match: {
      isActive: true
    }
  }, {
    $group: {
      _id: '$category',
      count: {
        $sum: 1
      },
      avgSuccessRate: {
        $avg: {
          $cond: [{
            $gt: ['$stats.timesAsked', 0]
          }, {
            $divide: ['$stats.timesCorrect', '$stats.timesAsked']
          }, 0]
        }
      }
    }
  }, {
    $sort: {
      count: -1
    }
  }]);
  const total = await Question.countDocuments({
    isActive: true
  });
  const difficultyValues = await Question.find({
    isActive: true
  }).select('difficulty').lean();
  const difficultyCounts = {
    easy: 0,
    medium: 0,
    hard: 0
  };
  difficultyValues.forEach(item => {
    const band = difficultyBand(item?.difficulty);
    difficultyCounts[band] += 1;
  });
  const byDifficulty = Object.entries(difficultyCounts).map(([band, count]) => ({
    _id: band,
    count
  }));
  res.json({
    success: true,
    data: {
      total,
      byCategory: stats,
      byDifficulty
    }
  });
});
const getPracticeQuestion = asyncHandler(async (req, res) => {
  const {
    category,
    difficulty,
    difficultyMin,
    difficultyMax,
    type
  } = req.query;
  const normalizedType = ['tossup', 'bonus', 'cycle'].includes(String(type || '').toLowerCase()) ? String(type).toLowerCase() : 'tossup';
  const query = {
    isActive: true
  };
  if (normalizedType !== 'cycle') {
    query.type = normalizeType(normalizedType);
  }
  if (category) {
    const canonicalCategories = String(category).split(',').map(c => normalizeCategory(c)).filter(Boolean);
    if (canonicalCategories.length > 0) {
      query.category = canonicalCategories.length > 1 ? {
        $in: canonicalCategories
      } : canonicalCategories[0];
    }
  }
  const parsedDifficultyMin = Number(difficultyMin);
  const parsedDifficultyMax = Number(difficultyMax);
  const hasDifficultyMin = Number.isFinite(parsedDifficultyMin);
  const hasDifficultyMax = Number.isFinite(parsedDifficultyMax);
  if (hasDifficultyMin || hasDifficultyMax) {
    const min = hasDifficultyMin ? Math.max(0, Math.min(1, parsedDifficultyMin)) : 0;
    const max = hasDifficultyMax ? Math.max(0, Math.min(1, parsedDifficultyMax)) : 1;
    const lower = Math.min(min, max);
    const upper = Math.max(min, max);
    query.difficulty = {
      $gte: lower,
      $lte: upper
    };
  } else if (difficulty) {
    const difficultyFilter = difficultyFilterFromInput(difficulty);
    if (difficultyFilter?.$or) {
      query.$or = difficultyFilter.$or;
    } else if (difficultyFilter?.difficulty) {
      query.difficulty = difficultyFilter.difficulty;
    }
  }
  const serializeQuestion = question => {
    const runtimeFormat = toRuntimeFormat(question.format);
    const runtimeType = toRuntimeType(question.type);
    return {
      id: question._id,
      questionText: question.questionText,
      format: runtimeFormat,
      formatLabel: question.format,
      type: runtimeType,
      typeLabel: question.type,
      category: question.category,
      categoryLabel: question.category,
      difficulty: normalizeDifficulty(question.difficulty),
      difficultyBand: difficultyBand(question.difficulty),
      explanation: '',
      choices: runtimeFormat === 'mc' ? question.choices : null
    };
  };
  if (normalizedType === 'cycle') {
    const tossupQuery = {
      ...query,
      type: normalizeType('tossup')
    };
    const [tossup] = await Question.aggregate([{
      $match: tossupQuery
    }, {
      $sample: {
        size: 1
      }
    }]);
    if (!tossup) {
      throw new ApiError('No tossup questions found matching criteria', 404);
    }
    let bonus = await Question.findOne({
      isActive: true,
      type: normalizeType('bonus'),
      relatedTossup: tossup._id
    }).lean();
    if (!bonus) {
      bonus = await Question.findOne({
        isActive: true,
        type: normalizeType('bonus'),
        category: tossup.category
      }).lean();
    }
    if (!bonus) {
      bonus = await Question.findOne({
        isActive: true,
        type: normalizeType('bonus')
      }).lean();
    }
    if (!bonus) {
      throw new ApiError('No bonus questions available for cycle practice', 404);
    }
    res.json({
      success: true,
      data: {
        cycle: {
          tossup: serializeQuestion(tossup),
          bonus: serializeQuestion(bonus)
        }
      }
    });
    return;
  }
  const [question] = await Question.aggregate([{
    $match: query
  }, {
    $sample: {
      size: 1
    }
  }]);
  if (!question) {
    throw new ApiError('No questions found matching criteria', 404);
  }
  res.json({
    success: true,
    data: {
      question: serializeQuestion(question)
    }
  });
});
const checkPracticeAnswer = asyncHandler(async (req, res) => {
  const {
    answer
  } = req.body;
  if (!answer) {
    throw new ApiError('Answer is required', 400);
  }
  const question = await Question.findById(req.params.id);
  if (!question) {
    throw new ApiError('Question not found', 404);
  }
  const isCorrect = question.checkAnswer(answer);
  question.stats.timesAsked += 1;
  if (isCorrect) {
    question.stats.timesCorrect += 1;
  }
  await question.save();
  res.json({
    success: true,
    data: {
      isCorrect,
      correctAnswer: getCanonicalAnswer(question.answer),
      acceptedAlternates: getAlternateAnswers(question.answer),
      explanation: '',
      difficulty: normalizeDifficulty(question.difficulty),
      difficultyBand: difficultyBand(question.difficulty)
    }
  });
});
const getCategories = asyncHandler(async (req, res) => {
  const categoryMeta = {
    Biology: {
      icon: '🧬',
      color: '#22c55e'
    },
    Chemistry: {
      icon: '⚗️',
      color: '#f59e0b'
    },
    Physics: {
      icon: '⚛️',
      color: '#3b82f6'
    },
    Mathematics: {
      icon: '📐',
      color: '#8b5cf6'
    },
    'Earth and Space': {
      icon: '🌍',
      color: '#10b981'
    },
    Energy: {
      icon: '⚡',
      color: '#eab308'
    },
    Other: {
      icon: '❔',
      color: '#64748b'
    }
  };
  const categories = QUESTION_CATEGORIES.map(key => ({
    key,
    ...(categoryMeta[key] || {})
  }));
  const counts = await Question.aggregate([{
    $match: {
      isActive: true
    }
  }, {
    $group: {
      _id: '$category',
      count: {
        $sum: 1
      }
    }
  }]);
  const countMap = counts.reduce((acc, c) => {
    acc[c._id] = c.count;
    return acc;
  }, {});
  const categoriesWithCount = categories.map(cat => ({
    id: cat.key,
    value: cat.key,
    name: cat.key,
    icon: cat.icon,
    color: cat.color,
    questionCount: countMap[cat.key] || 0
  }));
  res.json({
    success: true,
    data: {
      categories: categoriesWithCount
    }
  });
});
const reportQuestion = asyncHandler(async (req, res) => {
  const {
    id
  } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError('Invalid question id', 400);
  }
  const exists = await Question.exists({
    _id: id
  });
  if (!exists) {
    throw new ApiError('Question not found', 404);
  }
  const updateResult = await Reported.updateOne({
    questionId: id
  }, {
    $setOnInsert: {
      questionId: id
    }
  }, {
    upsert: true
  });
  const alreadyReported = updateResult.upsertedCount === 0;
  res.status(alreadyReported ? 200 : 201).json({
    success: true,
    data: {
      questionId: id,
      alreadyReported
    }
  });
});
module.exports = {
  getQuestionStats,
  getPracticeQuestion,
  checkPracticeAnswer,
  getCategories,
  reportQuestion
};
