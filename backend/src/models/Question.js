const mongoose = require('mongoose');
const {
  QUESTION_TYPES,
  QUESTION_FORMATS,
  QUESTION_CATEGORIES,
  normalizeType,
  normalizeFormat,
  normalizeCategory,
  normalizeDifficulty,
  difficultyFilterFromInput,
  getCanonicalAnswer,
  getAlternateAnswers
} = require('../utils/questionSchema');
const normalizeAnswerText = (value = '') => String(value).trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
const levenshteinDistance = (a = '', b = '') => {
  const matrix = [];
  const aLen = a.length;
  const bLen = b.length;
  for (let i = 0; i <= bLen; i++) matrix[i] = [i];
  for (let j = 0; j <= aLen; j++) matrix[0][j] = j;
  for (let i = 1; i <= bLen; i++) {
    for (let j = 1; j <= aLen; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[bLen][aLen];
};
const isWithinLevenshteinTolerance = (candidate = '', reference = '', ratio = 0.2) => {
  const normalizedCandidate = String(candidate || '');
  const normalizedReference = String(reference || '');
  const normalizedRatio = Number(ratio);
  if (!normalizedCandidate || !normalizedReference) return false;
  if (!Number.isFinite(normalizedRatio) || normalizedRatio < 0) return false;
  const referenceLength = normalizedReference.length;
  if (!referenceLength) return false;
  const distance = levenshteinDistance(normalizedCandidate, normalizedReference);
  return distance / referenceLength <= normalizedRatio;
};
const answerSchema = new mongoose.Schema({
  canonical: {
    type: String,
    required: true,
    trim: true
  },
  alternates: [{
    type: String,
    trim: true
  }]
}, {
  _id: false
});
const questionSchema = new mongoose.Schema({
  questionText: {
    type: String,
    required: [true, 'Question text is required'],
    trim: true
  },
  type: {
    type: String,
    enum: QUESTION_TYPES,
    required: true
  },
  format: {
    type: String,
    enum: QUESTION_FORMATS,
    required: true
  },
  category: {
    type: String,
    enum: QUESTION_CATEGORIES,
    required: true,
    index: true
  },
  difficulty: {
    type: Number,
    min: 0,
    max: 1,
    required: true,
    default: 0.5
  },
  answer: {
    type: answerSchema,
    required: true
  },
  explanation: {
    type: String,
    default: ''
  },
  tags: [{
    type: String
  }],
  source: {
    packet: {
      type: String,
      default: ''
    },
    round: {
      type: String,
      default: ''
    },
    question: {
      type: String,
      default: ''
    }
  },
  choices: {
    W: {
      type: String
    },
    X: {
      type: String
    },
    Y: {
      type: String
    },
    Z: {
      type: String
    }
  },
  stats: {
    timesAsked: {
      type: Number,
      default: 0
    },
    timesCorrect: {
      type: Number,
      default: 0
    },
    averageResponseTime: {
      type: Number,
      default: 0
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  relatedTossup: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question'
  }
}, {
  timestamps: true
});
questionSchema.pre('validate', function normalizeQuestion(next) {
  try {
    this.type = normalizeType(this.type);
    this.format = normalizeFormat(this.format);
    this.category = normalizeCategory(this.category);
    this.difficulty = normalizeDifficulty(this.difficulty);
    const canonical = getCanonicalAnswer(this.answer);
    const alternates = getAlternateAnswers(this.answer).map(alt => String(alt || '').trim()).filter(Boolean);
    const uniqueAlternates = Array.from(new Set(alternates.map(alt => alt.toLowerCase()))).map(lower => alternates.find(alt => alt.toLowerCase() === lower));
    this.answer = {
      canonical,
      alternates: uniqueAlternates
    };
    this.source = {
      packet: String(this.source?.packet || '').trim(),
      round: String(this.source?.round || '').trim(),
      question: String(this.source?.question || '').trim()
    };
    next();
  } catch (error) {
    next(error);
  }
});
questionSchema.index({
  category: 1,
  difficulty: 1,
  isActive: 1
});
questionSchema.index({
  type: 1,
  format: 1
});
questionSchema.index({
  'source.packet': 1,
  'source.round': 1
});
questionSchema.virtual('successRate').get(function successRate() {
  if (this.stats.timesAsked === 0) return 0;
  return (this.stats.timesCorrect / this.stats.timesAsked * 100).toFixed(1);
});
questionSchema.methods.checkAnswer = function checkAnswer(userAnswer) {
  const normalizedUserAnswer = normalizeAnswerText(userAnswer);
  const canonicalAnswer = getCanonicalAnswer(this.answer);
  const normalizedCanonicalAnswer = normalizeAnswerText(canonicalAnswer);
  const alternates = getAlternateAnswers(this.answer);
  const isMC = this.format === 'Multiple Choice';
  if (isMC) {
    if (normalizedUserAnswer === normalizedCanonicalAnswer) return true;
    const userLetter = String(userAnswer || '').trim().toUpperCase();
    const canonicalLetter = /^[WXYZ]$/i.test(String(canonicalAnswer || '').trim()) ? String(canonicalAnswer).trim().toUpperCase() : null;
    let resolvedLetter = canonicalLetter;
    if (!resolvedLetter && this.choices) {
      resolvedLetter = ['W', 'X', 'Y', 'Z'].find(letter => normalizeAnswerText(this.choices?.[letter] || '') === normalizedCanonicalAnswer) || null;
    }
    if (resolvedLetter && userLetter === resolvedLetter) return true;
    const correctChoiceText = resolvedLetter ? this.choices?.[resolvedLetter] : null;
    const normalizedChoiceText = normalizeAnswerText(correctChoiceText || '');
    if (normalizedChoiceText && normalizedUserAnswer === normalizedChoiceText) return true;
    if (normalizedChoiceText && normalizedUserAnswer) {
      if (isWithinLevenshteinTolerance(normalizedUserAnswer, normalizedChoiceText, 0.2)) return true;
    }
  }
  if (normalizedUserAnswer === normalizedCanonicalAnswer) return true;
  if (alternates.some(alt => normalizeAnswerText(alt) === normalizedUserAnswer)) return true;
  if (normalizedCanonicalAnswer && normalizedUserAnswer) {
    if (isWithinLevenshteinTolerance(normalizedUserAnswer, normalizedCanonicalAnswer, 0.2)) return true;
  }
  return alternates.some(alt => {
    const normalizedAlternate = normalizeAnswerText(alt);
    if (!normalizedAlternate) return false;
    return isWithinLevenshteinTolerance(normalizedUserAnswer, normalizedAlternate, 0.2);
  });
};
questionSchema.statics.getRandomQuestions = async function getRandomQuestions(count = 10, options = {}) {
  const query = {
    isActive: true,
    type: 'TOSSUP'
  };
  if (options.category) {
    query.category = normalizeCategory(options.category);
  }
  if (options.difficulty) {
    const difficultyFilter = difficultyFilterFromInput(options.difficulty);
    if (difficultyFilter?.$or) {
      query.$or = difficultyFilter.$or;
    } else if (difficultyFilter?.difficulty) {
      query.difficulty = difficultyFilter.difficulty;
    }
  }
  if (options.excludeIds && options.excludeIds.length > 0) {
    query._id = {
      $nin: options.excludeIds
    };
  }
  return this.aggregate([{
    $match: query
  }, {
    $sample: {
      size: count
    }
  }]);
};
questionSchema.statics.getBalancedQuestions = async function getBalancedQuestions(count = 10) {
  const questionsPerCategory = Math.ceil(count / QUESTION_CATEGORIES.length);
  const allQuestions = [];
  for (const category of QUESTION_CATEGORIES) {
    const categoryQuestions = await this.aggregate([{
      $match: {
        isActive: true,
        type: 'TOSSUP',
        category
      }
    }, {
      $sample: {
        size: questionsPerCategory
      }
    }]);
    allQuestions.push(...categoryQuestions);
  }
  return allQuestions.sort(() => Math.random() - 0.5).slice(0, count);
};
questionSchema.statics.getTossupBonusCycles = async function getTossupBonusCycles(cycles = 10, options = {}) {
  const parsedMin = Number(options?.difficultyMin);
  const parsedMax = Number(options?.difficultyMax);
  const boundedMin = Number.isFinite(parsedMin) ? Math.min(1, Math.max(0, parsedMin)) : 0;
  const boundedMax = Number.isFinite(parsedMax) ? Math.min(1, Math.max(0, parsedMax)) : 1;
  const difficultyMin = Math.min(boundedMin, boundedMax);
  const difficultyMax = Math.max(boundedMin, boundedMax);
  const difficultyMatch = {
    difficulty: {
      $gte: difficultyMin,
      $lte: difficultyMax
    }
  };
  const result = [];
  const usedQuestionIds = [];
  const usedQuestionIdSet = new Set();
  const markUsed = questionDoc => {
    const idString = String(questionDoc?._id || '');
    if (!idString || usedQuestionIdSet.has(idString)) return;
    usedQuestionIdSet.add(idString);
    usedQuestionIds.push(questionDoc._id);
  };
  for (let i = 0; i < cycles; i++) {
    const [tossup] = await this.aggregate([{
      $match: {
        isActive: true,
        type: 'TOSSUP',
        _id: {
          $nin: usedQuestionIds
        },
        ...difficultyMatch
      }
    }, {
      $sample: {
        size: 1
      }
    }]);
    if (!tossup) break;
    markUsed(tossup);
    const linkedBonus = await this.findOne({
      isActive: true,
      type: 'BONUS',
      relatedTossup: tossup._id,
      ...difficultyMatch,
      _id: {
        $nin: usedQuestionIds
      }
    }).lean();
    let bonus = linkedBonus;
    if (!bonus) {
      const [categoryBonus] = await this.aggregate([{
        $match: {
          isActive: true,
          type: 'BONUS',
          category: tossup.category,
          ...difficultyMatch,
          _id: {
            $nin: usedQuestionIds
          }
        }
      }, {
        $sample: {
          size: 1
        }
      }]);
      bonus = categoryBonus || null;
    }
    if (!bonus) {
      const [fallbackBonus] = await this.aggregate([{
        $match: {
          isActive: true,
          type: 'BONUS',
          ...difficultyMatch,
          _id: {
            $nin: usedQuestionIds
          }
        }
      }, {
        $sample: {
          size: 1
        }
      }]);
      bonus = fallbackBonus || null;
    }
    if (!bonus) {
      const [tossupAsBonus] = await this.aggregate([{
        $match: {
          isActive: true,
          type: 'TOSSUP',
          ...difficultyMatch,
          _id: {
            $nin: usedQuestionIds
          }
        }
      }, {
        $sample: {
          size: 1
        }
      }]);
      bonus = tossupAsBonus || null;
    }
    if (!bonus) break;
    markUsed(bonus);
    result.push(tossup, bonus);
  }
  return result;
};
questionSchema.set('toJSON', {
  virtuals: true
});
questionSchema.set('toObject', {
  virtuals: true
});
module.exports = mongoose.model('Question', questionSchema);
