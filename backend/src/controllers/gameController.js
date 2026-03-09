const Game = require('../models/Game');
const Question = require('../models/Question');
const User = require('../models/User');
const {
  asyncHandler,
  ApiError
} = require('../middleware/errorHandler');
const protestAdjudicationService = require('../services/protestAdjudicationService');
const {
  toRuntimeFormat,
  getCanonicalAnswer,
  normalizeDifficulty,
  difficultyBand
} = require('../utils/questionSchema');
const AI_DIFFICULTIES = new Set(['easy', 'medium', 'hard', 'expert']);
const resolveAIDifficulty = value => {
  const normalized = String(value || '').trim().toLowerCase();
  return AI_DIFFICULTIES.has(normalized) ? normalized : 'medium';
};
const hasUniqueQuestionIds = (questions = []) => {
  const ids = questions.map(q => String(q?._id || '')).filter(Boolean);
  return ids.length > 0 && new Set(ids).size === ids.length;
};
const resolveReviewRuntimeFormat = (questionFormat, fallbackFormat) => {
  const candidates = [questionFormat, fallbackFormat];
  for (const candidate of candidates) {
    const text = String(candidate || '').trim().toLowerCase();
    if (!text) continue;
    if (text === 'mc' || text === 'multiple choice' || text === 'multiple_choice' || text === 'multiplechoice') {
      return 'mc';
    }
    if (text === 'sa' || text === 'short answer' || text === 'short_answer' || text === 'shortanswer') {
      return 'sa';
    }
    try {
      return toRuntimeFormat(candidate);
    } catch {}
  }
  return 'sa';
};
const isSubstantiveAnswer = (response = {}) => {
  if (!response || typeof response !== 'object') return false;
  const answer = typeof response.answer === 'string' ? response.answer.trim() : '';
  return answer.length > 0;
};
const applyAcceptedProtestToQuestion = questionDoc => {
  if (!questionDoc) return false;
  let changed = false;
  const overrides = questionDoc.protest?.overrides || {};
  questionDoc.pointsAwarded = questionDoc.pointsAwarded || {
    player1: 0,
    player2: 0
  };
  ['player1', 'player2'].forEach(playerId => {
    if (overrides[playerId] !== true && overrides[playerId] !== false) return;
    const responseKey = `${playerId}Response`;
    const response = questionDoc[responseKey] || {};
    if (!isSubstantiveAnswer(response)) return;
    if (response.isCorrect !== overrides[playerId]) {
      response.isCorrect = overrides[playerId];
      questionDoc[responseKey] = response;
      changed = true;
    }
    const nextPoints = overrides[playerId] ? 4 : 0;
    if ((questionDoc.pointsAwarded[playerId] || 0) !== nextPoints) {
      questionDoc.pointsAwarded[playerId] = nextPoints;
      changed = true;
    }
  });
  if (changed) return changed;
  const claims = questionDoc.protest?.claims || {};
  ['player1', 'player2'].forEach(playerId => {
    const playerClaims = claims[playerId] || {};
    const opponentId = playerId === 'player1' ? 'player2' : 'player1';
    const ownResponseKey = `${playerId}Response`;
    const opponentResponseKey = `${opponentId}Response`;
    const ownResponse = questionDoc[ownResponseKey] || {};
    const opponentResponse = questionDoc[opponentResponseKey] || {};
    if (playerClaims.ownAnswerAccepted && isSubstantiveAnswer(ownResponse)) {
      if (ownResponse.isCorrect !== true) {
        ownResponse.isCorrect = true;
        questionDoc[ownResponseKey] = ownResponse;
        changed = true;
      }
      if ((questionDoc.pointsAwarded[playerId] || 0) < 4) {
        questionDoc.pointsAwarded[playerId] = 4;
        changed = true;
      }
    }
    if (playerClaims.opponentAnswerRejected && isSubstantiveAnswer(opponentResponse)) {
      if (opponentResponse.isCorrect !== false) {
        opponentResponse.isCorrect = false;
        questionDoc[opponentResponseKey] = opponentResponse;
        changed = true;
      }
      if ((questionDoc.pointsAwarded[opponentId] || 0) !== 0) {
        questionDoc.pointsAwarded[opponentId] = 0;
        changed = true;
      }
    }
  });
  return changed;
};
const recalculateGameScoreFromQuestions = gameDoc => {
  const recalculated = (gameDoc.questions || []).reduce((acc, q) => {
    acc.player1 += Number(q?.pointsAwarded?.player1 || 0);
    acc.player2 += Number(q?.pointsAwarded?.player2 || 0);
    return acc;
  }, {
    player1: 0,
    player2: 0
  });
  gameDoc.score.player1 = recalculated.player1;
  gameDoc.score.player2 = recalculated.player2;
  gameDoc.determineWinner();
};
const createGame = asyncHandler(async (req, res) => {
  const {
    gameType,
    aiDifficulty,
    categories
  } = req.body;
  const cycleCount = 10;
  const questionCount = cycleCount * 2;
  let gameCode;
  let attempts = 0;
  do {
    gameCode = Game.generateGameCode();
    const existing = await Game.findOne({
      gameCode,
      status: {
        $in: ['waiting', 'in_progress']
      }
    });
    if (!existing) break;
    attempts++;
  } while (attempts < 10);
  if (attempts >= 10) {
    throw new ApiError('Unable to generate game code. Please try again.', 500);
  }
  const selectedAIDifficulty = resolveAIDifficulty(aiDifficulty);
  let questions = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidateQuestions = await Question.getTossupBonusCycles(cycleCount);
    if (candidateQuestions.length >= questionCount && hasUniqueQuestionIds(candidateQuestions)) {
      questions = candidateQuestions;
      break;
    }
  }
  if (questions.length < questionCount || !hasUniqueQuestionIds(questions)) {
    throw new ApiError('Not enough tossup/bonus questions available', 500);
  }
  const gameData = {
    gameCode,
    gameType,
    player1: {
      userId: req.user._id,
      username: req.user.username,
      ratingBefore: req.user.rating
    },
    questions: questions.map((q, index) => ({
      questionId: q._id,
      questionNumber: index + 1,
      category: q.category,
      format: toRuntimeFormat(q.format)
    })),
    totalQuestions: questionCount,
    totalCycles: cycleCount,
    answerTime: 2000,
    settings: {
      categoryFilter: categories || []
    }
  };
  if (gameType === 'ai') {
    gameData.player2 = {
      isAI: true,
      aiDifficulty: selectedAIDifficulty,
      username: `AI (${selectedAIDifficulty.charAt(0).toUpperCase() + selectedAIDifficulty.slice(1)})`
    };
    gameData.status = 'in_progress';
    gameData.startTime = new Date();
  }
  const game = await Game.create(gameData);
  res.status(201).json({
    success: true,
    data: {
      game: {
        id: game._id,
        gameCode: game.gameCode,
        gameType: game.gameType,
        status: game.status,
        player1: game.player1,
        player2: game.player2
      }
    }
  });
});
const getGameByCode = asyncHandler(async (req, res) => {
  const game = await Game.findOne({
    gameCode: req.params.code.toUpperCase()
  });
  if (!game) {
    throw new ApiError('Game not found', 404);
  }
  res.json({
    success: true,
    data: {
      game
    }
  });
});
const getGameById = asyncHandler(async (req, res) => {
  const game = await Game.findById(req.params.id);
  if (!game) {
    throw new ApiError('Game not found', 404);
  }
  res.json({
    success: true,
    data: {
      game
    }
  });
});
const joinGame = asyncHandler(async (req, res) => {
  const game = await Game.findOne({
    gameCode: req.params.code.toUpperCase(),
    status: 'waiting'
  });
  if (!game) {
    throw new ApiError('Game not found or already started', 404);
  }
  if (game.player1.userId.equals(req.user._id)) {
    throw new ApiError('You cannot join your own game', 400);
  }
  game.player2 = {
    userId: req.user._id,
    username: req.user.username,
    ratingBefore: req.user.rating,
    isAI: false
  };
  game.status = 'in_progress';
  game.startTime = new Date();
  await game.save();
  res.json({
    success: true,
    data: {
      game
    }
  });
});
const getCurrentQuestion = asyncHandler(async (req, res) => {
  const game = await Game.findById(req.params.id);
  if (!game) {
    throw new ApiError('Game not found', 404);
  }
  if (game.status !== 'in_progress') {
    throw new ApiError('Game is not in progress', 400);
  }
  const isPlayer1 = game.player1.userId.equals(req.user._id);
  const isPlayer2 = game.player2?.userId?.equals(req.user._id);
  if (!isPlayer1 && !isPlayer2) {
    throw new ApiError('You are not a player in this game', 403);
  }
  if (game.currentQuestionIndex >= game.questions.length) {
    return res.json({
      success: true,
      data: {
        gameComplete: true,
        score: game.score
      }
    });
  }
  const questionData = game.questions[game.currentQuestionIndex];
  const question = await Question.findById(questionData.questionId);
  if (!question) {
    throw new ApiError('Question not found', 500);
  }
  res.json({
    success: true,
    data: {
      questionNumber: game.currentQuestionIndex + 1,
      totalQuestions: game.totalQuestions,
      question: {
        id: question._id,
        questionText: question.questionText,
        format: toRuntimeFormat(question.format),
        category: question.category,
        choices: toRuntimeFormat(question.format) === 'mc' ? question.choices : null
      },
      score: game.score,
      timeLimit: game.timePerQuestion
    }
  });
});
const getGameStats = asyncHandler(async (req, res) => {
  const [totalGames, activeGames, todayGames] = await Promise.all([Game.countDocuments({
    status: 'completed'
  }), Game.countDocuments({
    status: 'in_progress'
  }), Game.countDocuments({
    status: 'completed',
    createdAt: {
      $gte: new Date(new Date().setHours(0, 0, 0, 0))
    }
  })]);
  res.json({
    success: true,
    data: {
      totalGames,
      activeGames,
      todayGames
    }
  });
});
const cancelGame = asyncHandler(async (req, res) => {
  const game = await Game.findById(req.params.id);
  if (!game) {
    throw new ApiError('Game not found', 404);
  }
  if (!game.player1.userId.equals(req.user._id)) {
    throw new ApiError('Only the game creator can cancel', 403);
  }
  if (game.status !== 'waiting') {
    throw new ApiError('Can only cancel games that have not started', 400);
  }
  game.status = 'cancelled';
  await game.save();
  res.json({
    success: true,
    message: 'Game cancelled'
  });
});
const getActiveGames = asyncHandler(async (req, res) => {
  const games = await Game.find({
    $or: [{
      'player1.userId': req.user._id
    }, {
      'player2.userId': req.user._id
    }],
    status: {
      $in: ['waiting', 'in_progress']
    }
  }).sort({
    createdAt: -1
  });
  res.json({
    success: true,
    data: {
      games
    }
  });
});
const getGameReview = asyncHandler(async (req, res) => {
  const game = await Game.findById(req.params.id).populate('questions.questionId');
  if (!game) {
    throw new ApiError('Game not found', 404);
  }
  const reviewQuestions = game.questions.map((q, index) => {
    const questionDoc = q.questionId && typeof q.questionId === 'object' ? q.questionId : null;
    const runtimeFormat = resolveReviewRuntimeFormat(questionDoc?.format, q.format);
    return {
      index: index + 1,
      questionId: questionDoc?._id || q.questionId,
      questionText: questionDoc?.questionText || '',
      category: q.category || questionDoc?.category || '',
      format: runtimeFormat,
      choices: runtimeFormat === 'mc' ? questionDoc?.choices || null : null,
      correctAnswer: getCanonicalAnswer(questionDoc?.answer) || '',
      explanation: '',
      difficulty: normalizeDifficulty(questionDoc?.difficulty),
      difficultyBand: difficultyBand(questionDoc?.difficulty),
      player1Response: q.player1Response || {},
      player2Response: q.player2Response || {},
      pointsAwarded: q.pointsAwarded || {
        player1: 0,
        player2: 0
      },
      protest: {
        protestedBy: q.protest?.protestedBy || [],
        claims: {
          player1: {
            ownAnswerAccepted: Boolean(q.protest?.claims?.player1?.ownAnswerAccepted),
            opponentAnswerRejected: Boolean(q.protest?.claims?.player1?.opponentAnswerRejected)
          },
          player2: {
            ownAnswerAccepted: Boolean(q.protest?.claims?.player2?.ownAnswerAccepted),
            opponentAnswerRejected: Boolean(q.protest?.claims?.player2?.opponentAnswerRejected)
          }
        },
        votes: q.protest?.votes || {
          player1: null,
          player2: null
        },
        overrides: q.protest?.overrides || {
          player1: null,
          player2: null
        },
        actions: q.protest?.actions || [],
        negotiation: q.protest?.negotiation || null,
        resolved: Boolean(q.protest?.resolved),
        accepted: q.protest?.accepted ?? null,
        decidedBy: q.protest?.decidedBy ?? null,
        rationale: q.protest?.rationale || ''
      }
    };
  });
  res.json({
    success: true,
    data: {
      game: {
        _id: game._id,
        gameCode: game.gameCode,
        gameType: game.gameType,
        status: game.status,
        winner: game.winner,
        score: game.score,
        player1: game.player1,
        player2: game.player2,
        createdAt: game.createdAt,
        endTime: game.endTime,
        totalQuestions: game.totalQuestions
      },
      questions: reviewQuestions
    }
  });
});
const voteGameProtest = asyncHandler(async (req, res) => {
  const {
    questionIndex,
    vote
  } = req.body;
  const normalizedVote = vote === 'accept' ? 'accept' : 'reject';
  const game = await Game.findById(req.params.id).populate('questions.questionId');
  if (!game) {
    throw new ApiError('Game not found', 404);
  }
  const isPlayer1 = game.player1?.userId?.equals(req.user._id);
  const isPlayer2 = game.player2?.userId?.equals(req.user._id);
  if (!isPlayer1 && !isPlayer2) {
    throw new ApiError('You are not a player in this game', 403);
  }
  const idx = Number(questionIndex) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= game.questions.length) {
    throw new ApiError('Invalid question index', 400);
  }
  const q = game.questions[idx];
  q.protest = q.protest || {
    protestedBy: [],
    claims: {
      player1: {
        ownAnswerAccepted: false,
        opponentAnswerRejected: false
      },
      player2: {
        ownAnswerAccepted: false,
        opponentAnswerRejected: false
      }
    },
    votes: {
      player1: null,
      player2: null
    },
    overrides: {
      player1: null,
      player2: null
    },
    actions: [],
    resolved: false,
    accepted: null,
    decidedBy: null,
    rationale: ''
  };
  q.protest.claims = q.protest.claims || {
    player1: {
      ownAnswerAccepted: false,
      opponentAnswerRejected: false
    },
    player2: {
      ownAnswerAccepted: false,
      opponentAnswerRejected: false
    }
  };
  q.protest.overrides = q.protest.overrides || {
    player1: null,
    player2: null
  };
  q.protest.actions = q.protest.actions || [];
  if (q.protest.resolved) {
    recalculateGameScoreFromQuestions(game);
    await game.save();
    res.json({
      success: true,
      data: {
        questionIndex: idx + 1,
        protest: q.protest,
        score: game.score
      }
    });
    return;
  }
  if (!q.protest.protestedBy || q.protest.protestedBy.length === 0) {
    throw new ApiError('No protest exists for this question', 400);
  }
  const voterId = isPlayer1 ? 'player1' : 'player2';
  q.protest.votes = q.protest.votes || {
    player1: null,
    player2: null
  };
  q.protest.votes[voterId] = normalizedVote;
  const isAI = Boolean(game.player2?.isAI);
  const vote1 = q.protest.votes.player1;
  const vote2 = q.protest.votes.player2;
  if (isAI) {
    q.protest.votes = {
      player1: 'accept',
      player2: 'accept'
    };
    q.protest.resolved = true;
    q.protest.accepted = true;
    q.protest.decidedBy = 'players';
    q.protest.rationale = 'AI auto-accepted the protest.';
    q.protest.resolvedAt = new Date();
  } else if (vote1 && vote2) {
    if (vote1 === vote2) {
      q.protest.resolved = true;
      q.protest.accepted = vote1 === 'accept';
      q.protest.decidedBy = 'players';
      q.protest.rationale = 'Both players agreed on the protest outcome.';
      q.protest.resolvedAt = new Date();
    } else {
      const adjudication = await protestAdjudicationService.adjudicateProtest({
        questionText: q.questionId?.questionText || '',
        correctAnswer: getCanonicalAnswer(q.questionId?.answer) || '',
        responses: {
          player1: q.player1Response || {},
          player2: q.player2Response || {}
        },
        protesters: q.protest.protestedBy || []
      });
      q.protest.resolved = true;
      q.protest.accepted = adjudication.accepted;
      q.protest.decidedBy = adjudication.decidedBy;
      q.protest.rationale = adjudication.rationale;
      q.protest.resolvedAt = new Date();
    }
  }
  if (q.protest.resolved && q.protest.accepted) {
    applyAcceptedProtestToQuestion(q);
  }
  recalculateGameScoreFromQuestions(game);
  await game.save();
  res.json({
    success: true,
    data: {
      questionIndex: idx + 1,
      protest: q.protest,
      score: game.score
    }
  });
});
const forfeitReviewProtests = asyncHandler(async (req, res) => {
  const game = await Game.findById(req.params.id);
  if (!game) {
    throw new ApiError('Game not found', 404);
  }
  const isPlayer1 = game.player1?.userId?.equals(req.user._id);
  const isPlayer2 = game.player2?.userId?.equals(req.user._id);
  if (!isPlayer1 && !isPlayer2) {
    throw new ApiError('You are not a player in this game', 403);
  }
  const forfeiterId = isPlayer1 ? 'player1' : 'player2';
  const opponentId = forfeiterId === 'player1' ? 'player2' : 'player1';
  let updatedCount = 0;
  game.questions.forEach(q => {
    const protest = q.protest;
    const hasProtest = Boolean(protest?.protestedBy?.length);
    if (!hasProtest || protest?.resolved) return;
    const opponentProtested = protest.protestedBy.includes(opponentId);
    const forfeiterProtested = protest.protestedBy.includes(forfeiterId);
    const accepted = opponentProtested && !forfeiterProtested ? true : forfeiterProtested && !opponentProtested ? false : opponentProtested;
    protest.votes = protest.votes || {
      player1: null,
      player2: null
    };
    protest.votes[forfeiterId] = 'reject';
    protest.votes[opponentId] = accepted ? 'accept' : 'reject';
    protest.resolved = true;
    protest.accepted = accepted;
    protest.decidedBy = 'players';
    protest.rationale = 'Resolved by forfeit due to one player leaving before protest resolution.';
    protest.resolvedAt = new Date();
    if (accepted) {
      applyAcceptedProtestToQuestion(q);
    }
    updatedCount += 1;
  });
  recalculateGameScoreFromQuestions(game);
  await game.save();
  res.json({
    success: true,
    data: {
      updatedCount
    }
  });
});
module.exports = {
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
};
