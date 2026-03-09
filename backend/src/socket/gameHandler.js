const Game = require('../models/Game');
const Question = require('../models/Question');
const User = require('../models/User');
const ratingService = require('../services/ratingService');
const aiService = require('../services/aiService');
const protestNegotiationService = require('../services/protestNegotiationService');
const {
  normalizeType,
  toRuntimeFormat,
  getCanonicalAnswer
} = require('../utils/questionSchema');
const hasSubstantiveAnswer = (response = {}) => {
  if (!response || typeof response !== 'object') return false;
  const answer = typeof response.answer === 'string' ? response.answer.trim() : '';
  return answer.length > 0;
};
const getQuestionResponseState = questionDoc => {
  const player1Answered = hasSubstantiveAnswer(questionDoc?.player1Response || {});
  const player2Answered = hasSubstantiveAnswer(questionDoc?.player2Response || {});
  return {
    player1Answered,
    player2Answered
  };
};
const computeSecondsLeft = untilMs => Math.max(0, Math.ceil((untilMs - Date.now()) / 1000));
const TEAM_DUEL_TOSSUP_BUZZ_MS = 5000;
const WORD_REVEAL_PACE_MS = 320;
const POST_READ_BUZZ_MS = 5000;
const MC_OPTION_PREFIX_PAUSE_MS = 280;
const MC_OPTION_INTER_OPTION_PAUSE_MS = 220;
const TOSSUP_TYPING_START_WINDOW_MS = 2000;
const BONUS_TYPING_START_WINDOW_MS = 3000;
const TYPING_IDLE_TIMEOUT_MS = 2000;
const TYPING_HARD_CAP_MS = 60000;
const TYPING_NO_PROGRESS_TIMEOUT_MS = 2000;
const TYPING_START_GRACE_MS = 1000;
const BUZZ_TIMEOUT_BUFFER_MS = 200;
const PROTEST_ALLOWED_DELTA_PAIRS = [{
  myDelta: -4,
  opponentDelta: 0
}, {
  myDelta: -4,
  opponentDelta: 4
}, {
  myDelta: -4,
  opponentDelta: 14
}, {
  myDelta: 0,
  opponentDelta: -4
}, {
  myDelta: 0,
  opponentDelta: 0
}, {
  myDelta: 0,
  opponentDelta: 4
}, {
  myDelta: 0,
  opponentDelta: 14
}, {
  myDelta: 4,
  opponentDelta: -4
}, {
  myDelta: 4,
  opponentDelta: 0
}, {
  myDelta: 14,
  opponentDelta: -4
}, {
  myDelta: 14,
  opponentDelta: 0
}];
const mapProtesterNames = (gameState, protestedBy = []) => {
  const unique = Array.from(new Set((protestedBy || []).filter(Boolean)));
  return unique.map(playerId => {
    if (playerId === 'player1') {
      return gameState?.players?.player1?.username || 'Player 1';
    }
    if (playerId === 'player2') {
      if (gameState?.players?.player2?.isAI) return gameState?.players?.player2?.username || 'AI';
      return gameState?.players?.player2?.username || 'Player 2';
    }
    return playerId;
  });
};
const isTeamDuelType = () => false;
const getTypingStartWindowMs = (questionKind = 'tossup') => questionKind === 'bonus' ? BONUS_TYPING_START_WINDOW_MS : TOSSUP_TYPING_START_WINDOW_MS;
const getTextReadDurationMs = (text = '', paceMs = WORD_REVEAL_PACE_MS) => {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(0, words * paceMs);
};
const getMCOptionRevealDurationMs = (choices = {}, paceMs = WORD_REVEAL_PACE_MS) => {
  const letters = ['W', 'X', 'Y', 'Z'];
  let total = 0;
  letters.forEach((letter, index) => {
    const text = String(choices?.[letter] || '').trim();
    total += MC_OPTION_PREFIX_PAUSE_MS + getTextReadDurationMs(text, paceMs);
    if (index < letters.length - 1) total += MC_OPTION_INTER_OPTION_PAUSE_MS;
  });
  return Math.max(0, total);
};
const getReadWindow = ({
  questionText = '',
  format = 'sa',
  choices = {}
} = {}) => {
  const words = String(questionText || '').trim().split(/\s+/).filter(Boolean);
  const textReadDurationMs = Math.max(3500, words.length * WORD_REVEAL_PACE_MS);
  const readStartedAt = Date.now();
  const textReadEndsAt = readStartedAt + textReadDurationMs;
  const fullReadEndsAt = format === 'mc' ? textReadEndsAt + getMCOptionRevealDurationMs(choices, WORD_REVEAL_PACE_MS) : textReadEndsAt;
  return {
    readStartedAt,
    textReadEndsAt,
    fullReadEndsAt
  };
};
const getAllowedProtestPairs = (ctx = {}) => {
  if (Array.isArray(ctx.allowedPairs) && ctx.allowedPairs.length > 0) {
    return ctx.allowedPairs.map(pair => ({
      myDelta: Number(pair?.myDelta),
      opponentDelta: Number(pair?.opponentDelta)
    })).filter(pair => Number.isFinite(pair.myDelta) && Number.isFinite(pair.opponentDelta));
  }
  return PROTEST_ALLOWED_DELTA_PAIRS;
};
const isAllowedProtestPair = (myDelta, opponentDelta, allowedPairs = PROTEST_ALLOWED_DELTA_PAIRS) => {
  return allowedPairs.some(pair => Number(pair.myDelta) === Number(myDelta) && Number(pair.opponentDelta) === Number(opponentDelta));
};
const splitCycleDelta = delta => {
  const normalized = Number(delta || 0);
  if (normalized === 14) return {
    tossup: 4,
    bonus: 10
  };
  if (normalized === 4) return {
    tossup: 4,
    bonus: 0
  };
  if (normalized === 0) return {
    tossup: 0,
    bonus: 0
  };
  if (normalized === -4) return {
    tossup: -4,
    bonus: 0
  };
  return {
    tossup: normalized,
    bonus: 0
  };
};
const applyCycleDeltaProposal = (gameDoc, cycleNumber, proposal = {}) => {
  if (!gameDoc || !Number.isFinite(Number(cycleNumber))) return false;
  const cycleIndex = Math.max(0, Number(cycleNumber) - 1);
  const tossupIndex = cycleIndex * 2;
  const bonusIndex = tossupIndex + 1;
  const tossupDoc = gameDoc.questions?.[tossupIndex];
  if (!tossupDoc) return false;
  const bonusDoc = gameDoc.questions?.[bonusIndex] || null;
  const p1Parts = splitCycleDelta(proposal.player1Delta);
  const p2Parts = splitCycleDelta(proposal.player2Delta);
  tossupDoc.pointsAwarded = tossupDoc.pointsAwarded || {
    player1: 0,
    player2: 0
  };
  tossupDoc.pointsAwarded.player1 = Number(p1Parts.tossup || 0);
  tossupDoc.pointsAwarded.player2 = Number(p2Parts.tossup || 0);
  if (bonusDoc) {
    bonusDoc.pointsAwarded = bonusDoc.pointsAwarded || {
      player1: 0,
      player2: 0
    };
    bonusDoc.pointsAwarded.player1 = Number(p1Parts.bonus || 0);
    bonusDoc.pointsAwarded.player2 = Number(p2Parts.bonus || 0);
  } else {
    tossupDoc.pointsAwarded.player1 += Number(p1Parts.bonus || 0);
    tossupDoc.pointsAwarded.player2 += Number(p2Parts.bonus || 0);
  }
  return true;
};
const recalculateGameScoreFromQuestions = gameDoc => {
  const score = (gameDoc.questions || []).reduce((acc, q) => {
    acc.player1 += Number(q?.pointsAwarded?.player1 || 0);
    acc.player2 += Number(q?.pointsAwarded?.player2 || 0);
    return acc;
  }, {
    player1: 0,
    player2: 0
  });
  gameDoc.score.player1 = score.player1;
  gameDoc.score.player2 = score.player2;
  return score;
};
const applyAcceptedProtestClaimsToQuestion = questionDoc => {
  if (!questionDoc) return;
  questionDoc.pointsAwarded = questionDoc.pointsAwarded || {
    player1: 0,
    player2: 0
  };
  const overrides = questionDoc.protest?.overrides || {};
  ['player1', 'player2'].forEach(playerId => {
    if (overrides[playerId] !== true && overrides[playerId] !== false) return;
    const responseKey = `${playerId}Response`;
    const response = questionDoc[responseKey] || {};
    if (!hasSubstantiveAnswer(response)) return;
    response.isCorrect = overrides[playerId];
    questionDoc[responseKey] = response;
    questionDoc.pointsAwarded[playerId] = overrides[playerId] ? 4 : 0;
  });
  const claims = questionDoc.protest?.claims || {};
  ['player1', 'player2'].forEach(playerId => {
    const playerClaims = claims[playerId] || {};
    const opponentId = playerId === 'player1' ? 'player2' : 'player1';
    const ownResponseKey = `${playerId}Response`;
    const opponentResponseKey = `${opponentId}Response`;
    const ownResponse = questionDoc[ownResponseKey] || {};
    const opponentResponse = questionDoc[opponentResponseKey] || {};
    if (playerClaims.ownAnswerAccepted && hasSubstantiveAnswer(ownResponse)) {
      ownResponse.isCorrect = true;
      questionDoc[ownResponseKey] = ownResponse;
      questionDoc.pointsAwarded[playerId] = Math.max(questionDoc.pointsAwarded[playerId] || 0, 4);
    }
    if (playerClaims.opponentAnswerRejected && hasSubstantiveAnswer(opponentResponse)) {
      opponentResponse.isCorrect = false;
      questionDoc[opponentResponseKey] = opponentResponse;
      questionDoc.pointsAwarded[opponentId] = 0;
    }
  });
};
class GameHandler {
  constructor(io) {
    this.io = io;
    this.activeGames = new Map();
    this.playerRooms = new Map();
  }
  resolvePlayerIdForUser(game, userId) {
    const normalizedUserId = String(userId || '');
    if (!normalizedUserId) return null;
    if (isTeamDuelType(game?.gameType)) {
      const team1Members = game?.settings?.team1?.members || [];
      const team2Members = game?.settings?.team2?.members || [];
      const inTeam1 = team1Members.some(member => String(member?.userId) === normalizedUserId);
      const inTeam2 = team2Members.some(member => String(member?.userId) === normalizedUserId);
      if (inTeam1) return 'player1';
      if (inTeam2) return 'player2';
      return null;
    }
    if (String(game?.player1?.userId || '') === normalizedUserId) return 'player1';
    if (String(game?.player2?.userId || '') === normalizedUserId) return 'player2';
    return null;
  }
  hasConnectedPlayer(gameCode, playerId) {
    for (const roomInfo of this.playerRooms.values()) {
      if (roomInfo.gameCode === gameCode && roomInfo.playerId === playerId) {
        return true;
      }
    }
    return false;
  }
  initialize(socket) {
    socket.on('game:create', data => this.handleCreateGame(socket, data));
    socket.on('game:join', data => this.handleJoinGame(socket, data));
    socket.on('game:ready', data => this.handlePlayerReady(socket, data));
    socket.on('game:buzz', data => this.handleBuzz(socket, data));
    socket.on('game:answer', data => this.handleAnswer(socket, data));
    socket.on('game:inputActivity', data => this.handleInputActivity(socket, data));
    socket.on('game:protest', data => {
      this.handleProtest(socket, data).catch(error => {
        console.error('Protest handling error:', error);
        socket.emit('game:error', {
          message: 'Failed to submit protest'
        });
      });
    });
    socket.on('game:protestAdjust:start', data => this.handleProtestAdjustStart(socket, data));
    socket.on('game:protestAdjust:cancel', data => this.handleProtestAdjustCancel(socket, data));
    socket.on('game:protestAdjust:submit', data => this.handleProtestAdjustSubmit(socket, data));
    socket.on('game:protestAdjust:respond', data => this.handleProtestAdjustRespond(socket, data));
    socket.on('game:protestVote', data => this.handleProtestVote(socket, data));
    socket.on('game:nextReady', data => this.handleNextReady(socket, data));
    socket.on('game:leave', data => this.handleLeaveGame(socket, data));
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }
  async handleCreateGame(socket, data) {
    try {
      const {
        gameCode,
        gameType
      } = data;
      if (this.activeGames.has(gameCode)) {
        await this.handleJoinGame(socket, {
          gameCode
        });
        return;
      }
      const game = await Game.findOne({
        gameCode
      });
      if (!game) {
        socket.emit('game:error', {
          message: 'Game not found'
        });
        return;
      }
      const assignedPlayerId = this.resolvePlayerIdForUser(game, socket.user._id);
      if (!assignedPlayerId) {
        socket.emit('game:error', {
          message: 'You are not a participant in this game'
        });
        return;
      }
      socket.join(gameCode);
      this.playerRooms.set(socket.id, {
        gameCode,
        playerId: assignedPlayerId
      });
      const gameState = {
        gameCode,
        gameType,
        isTeamDuel: isTeamDuelType(gameType),
        totalCycles: Number(game.totalCycles || 10),
        players: {
          player1: {
            socketId: assignedPlayerId === 'player1' ? socket.id : null,
            userId: String(game.player1?.userId || socket.user._id),
            username: game.player1?.username || socket.user.username,
            ready: false,
            buzzed: false,
            score: 0
          },
          player2: game.player2?.isAI ? {
            userId: null,
            isAI: true,
            username: game.player2.username || 'AI',
            difficulty: game.player2.aiDifficulty,
            ready: true,
            buzzed: false,
            score: 0
          } : game.player2 ? {
            socketId: assignedPlayerId === 'player2' ? socket.id : null,
            userId: String(game.player2.userId || ''),
            username: game.player2.username,
            ready: false,
            buzzed: false,
            score: 0
          } : null
        },
        currentQuestion: 0,
        activeQuestionIndex: 0,
        currentQuestionKind: 'tossup',
        currentCycle: 1,
        phase: 'waiting',
        questionTimer: null,
        buzzTimer: null,
        answerTimer: null,
        countdownTimer: null,
        transitionTimer: null,
        protestTimer: null,
        protestVoteTimer: null,
        protestAdjustTimer: null,
        started: false,
        roundId: 0
      };
      gameState.buzzWindowTime = game.buzzWindowTime ?? 10000;
      gameState.answerTime = game.answerTime ?? 2000;
      gameState.eligibleBuzzer = null;
      gameState.protestContext = null;
      gameState.protestAdjustContext = null;
      gameState.nextAdvanceContext = null;
      gameState.currentPointValue = 4;
      gameState.currentBuzzerSocketId = null;
      gameState.bonusResponderUserId = null;
      gameState.answerResolved = false;
      this.activeGames.set(gameCode, gameState);
      socket.emit('game:created', {
        gameCode,
        gameState: this.sanitizeGameState(gameState)
      });
      console.log(`[GameHandler] Game ${gameCode} created by ${socket.user.username}. AI game: ${Boolean(game.player2?.isAI)}`);
      if (game.player2?.isAI) {
        console.log(`[GameHandler] Starting AI game ${gameCode} immediately`);
        gameState.players.player1.ready = true;
        this.startGame(gameCode);
      }
    } catch (error) {
      console.error('Create game error:', error);
      socket.emit('game:error', {
        message: 'Failed to create game'
      });
    }
  }
  async handleJoinGame(socket, data) {
    try {
      const {
        gameCode
      } = data;
      const gameState = this.activeGames.get(gameCode);
      if (!gameState) {
        socket.emit('game:error', {
          message: 'Game not found'
        });
        return;
      }
      const game = await Game.findOne({
        gameCode
      });
      if (!game) {
        socket.emit('game:error', {
          message: 'Game not found'
        });
        return;
      }
      const assignedPlayerId = this.resolvePlayerIdForUser(game, socket.user._id);
      if (!assignedPlayerId) {
        socket.emit('game:error', {
          message: 'You are not a participant in this game'
        });
        return;
      }
      if (!gameState.isTeamDuel && assignedPlayerId === 'player2' && gameState.players.player2 && !gameState.players.player2.isAI && String(gameState.players.player2.userId || '') !== String(socket.user._id || '')) {
        socket.emit('game:error', {
          message: 'Game is full'
        });
        return;
      }
      socket.join(gameCode);
      this.playerRooms.set(socket.id, {
        gameCode,
        playerId: assignedPlayerId
      });
      if (assignedPlayerId === 'player2' && (!gameState.players.player2 || gameState.players.player2.isAI)) {
        gameState.players.player2 = {
          socketId: socket.id,
          userId: String(game.player2?.userId || socket.user._id),
          username: game.player2?.username || socket.user.username,
          ready: false,
          buzzed: false,
          score: gameState.players.player2?.score || 0
        };
      }
      if (assignedPlayerId === 'player1' && !gameState.players.player1) {
        gameState.players.player1 = {
          socketId: socket.id,
          userId: String(game.player1?.userId || socket.user._id),
          username: game.player1?.username || socket.user.username,
          ready: false,
          buzzed: false,
          score: 0
        };
      }
      this.io.to(gameCode).emit('game:playerJoined', {
        player: {
          username: socket.user.username,
          playerId: assignedPlayerId
        },
        gameState: this.sanitizeGameState(gameState)
      });
      if (['ranked', 'unranked_1v1'].includes(gameState.gameType)) {
        console.log(`[GameHandler] ${gameState.gameType} game ${gameCode}: Both players ready, auto-starting`);
        const hasPlayer1Connected = this.hasConnectedPlayer(gameCode, 'player1');
        const hasPlayer2Connected = gameState.players.player2?.isAI || this.hasConnectedPlayer(gameCode, 'player2');
        if (hasPlayer1Connected) gameState.players.player1.ready = true;
        if (hasPlayer2Connected && gameState.players.player2) gameState.players.player2.ready = true;
        if (hasPlayer1Connected && hasPlayer2Connected) {
          this.startGame(gameCode);
        }
      }
    } catch (error) {
      console.error('Join game error:', error);
      socket.emit('game:error', {
        message: 'Failed to join game'
      });
    }
  }
  handlePlayerReady(socket, data) {
    const {
      gameCode
    } = data;
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    const playerInfo = this.playerRooms.get(socket.id);
    if (!playerInfo) return;
    gameState.players[playerInfo.playerId].ready = true;
    this.io.to(gameCode).emit('game:playerReady', {
      playerId: playerInfo.playerId,
      gameState: this.sanitizeGameState(gameState)
    });
    if (gameState.players.player1?.ready && gameState.players.player2?.ready) {
      this.startGame(gameCode);
    }
  }
  async startGame(gameCode) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    if (gameState.started || gameState.phase === 'starting' || gameState.phase === 'complete') {
      return;
    }
    gameState.started = true;
    gameState.phase = 'starting';
    try {
      const game = await Game.findOne({
        gameCode
      });
      if (!game) {
        gameState.started = false;
        gameState.phase = 'waiting';
        return;
      }
      game.status = 'in_progress';
      game.startTime = new Date();
      await game.save();
      gameState.totalCycles = Number(game.totalCycles || gameState.totalCycles || 10);
      this.clearGameTimers(gameState);
      console.log(`[GameHandler] Emitting game:start for ${gameCode} to room`);
      this.io.to(gameCode).emit('game:start', {
        gameState: this.sanitizeGameState(gameState),
        totalQuestions: gameState.totalCycles || 10
      });
      console.log(`[GameHandler] game:start emitted for ${gameCode}`);
      gameState.countdownTimer = setTimeout(() => {
        const latestGameState = this.activeGames.get(gameCode);
        if (!latestGameState || !latestGameState.started || latestGameState.phase === 'complete') return;
        this.nextQuestion(gameCode).catch(error => {
          console.error('nextQuestion startup error:', error);
        });
      }, 3000);
    } catch (error) {
      gameState.started = false;
      gameState.phase = 'waiting';
      console.error('startGame error:', error);
      this.io.to(gameCode).emit('game:error', {
        message: 'Failed to start game'
      });
    }
  }
  async nextQuestion(gameCode) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    clearTimeout(gameState.buzzTimer);
    clearTimeout(gameState.answerTimer);
    clearTimeout(gameState.transitionTimer);
    const game = await Game.findOne({
      gameCode
    });
    if (!game) return;
    if (typeof gameState.completedCycles !== 'number') gameState.completedCycles = 0;
    if (typeof gameState.suddenDeath !== 'boolean') gameState.suddenDeath = false;
    if (!gameState.suddenDeath && gameState.completedCycles >= 10) {
      if ((gameState.players.player1.score || 0) !== (gameState.players.player2?.score || 0)) {
        this.endGame(gameCode);
        return;
      }
      gameState.suddenDeath = true;
    }
    let questionIndex;
    let questionData;
    if (!gameState.suddenDeath) {
      questionIndex = gameState.completedCycles * 2;
      if (questionIndex >= game.questions.length) {
        this.endGame(gameCode);
        return;
      }
      questionData = game.questions[questionIndex];
    } else {
      const tossups = await Question.aggregate([{
        $match: {
          isActive: true,
          type: normalizeType('tossup')
        }
      }, {
        $sample: {
          size: 1
        }
      }]);
      if (!tossups.length) {
        this.endGame(gameCode);
        return;
      }
      const sdQuestion = tossups[0];
      game.questions.push({
        questionId: sdQuestion._id,
        questionNumber: game.questions.length + 1,
        category: sdQuestion.category,
        format: toRuntimeFormat(sdQuestion.format)
      });
      await game.save();
      questionIndex = game.questions.length - 1;
      questionData = game.questions[questionIndex];
    }
    const question = await Question.findById(questionData.questionId);
    if (!question) {
      console.error('Question not found');
      return;
    }
    gameState.activeQuestionIndex = questionIndex;
    gameState.currentQuestionKind = 'tossup';
    gameState.currentCycle = gameState.completedCycles + 1;
    gameState.phase = 'buzzing';
    gameState.eligibleBuzzer = null;
    gameState.currentBuzzer = null;
    gameState.currentBuzzerSocketId = null;
    gameState.bonusResponderUserId = null;
    gameState.answerResolved = false;
    gameState.typingState = null;
    gameState.secondChanceWasInterruptRestart = false;
    gameState.roundId = (gameState.roundId || 0) + 1;
    const roundId = gameState.roundId;
    gameState.players.player1.buzzed = false;
    if (gameState.players.player2) gameState.players.player2.buzzed = false;
    const runtimeFormat = toRuntimeFormat(question.format);
    const runtimeCategory = question.category;
    const canonicalAnswer = getCanonicalAnswer(question.answer);
    gameState.currentQuestionData = {
      id: question._id,
      questionText: question.questionText,
      format: runtimeFormat,
      category: runtimeCategory,
      choices: runtimeFormat === 'mc' ? question.choices : null,
      answer: canonicalAnswer,
      startTime: Date.now(),
      kind: 'tossup',
      pointValue: 4
    };
    gameState.currentPointValue = 4;
    gameState.tossupAttempts = {
      player1: false,
      player2: false
    };
    const readWindow = getReadWindow({
      questionText: question.questionText,
      format: runtimeFormat,
      choices: question.choices
    });
    gameState.questionReadStartedAt = readWindow.readStartedAt;
    gameState.questionTextReadEndsAt = readWindow.textReadEndsAt;
    gameState.questionReadEndsAt = readWindow.fullReadEndsAt;
    const buzzStartsAt = gameState.questionReadEndsAt;
    const buzzEndsAt = buzzStartsAt + POST_READ_BUZZ_MS;
    const buzzWindowTime = POST_READ_BUZZ_MS;
    gameState.buzzWindowStart = buzzStartsAt;
    gameState.buzzWindowEnd = buzzEndsAt;
    this.io.to(gameCode).emit('game:question', {
      questionNumber: gameState.currentCycle,
      totalQuestions: gameState.totalCycles || 10,
      roundId,
      suddenDeath: Boolean(gameState.suddenDeath),
      buzzWindowTime,
      buzzStartsAt,
      buzzEndsAt,
      question: {
        questionText: question.questionText,
        format: runtimeFormat,
        category: runtimeCategory,
        choices: runtimeFormat === 'mc' ? question.choices : null,
        questionKind: 'tossup',
        pointValue: 4,
        wordPaceMs: WORD_REVEAL_PACE_MS,
        readStartedAt: gameState.questionReadStartedAt,
        readEndsAt: gameState.questionTextReadEndsAt,
        fullReadEndsAt: gameState.questionReadEndsAt,
        revealChoicesAfterRead: runtimeFormat === 'mc',
        mcOptionPrefixPauseMs: MC_OPTION_PREFIX_PAUSE_MS,
        mcOptionInterOptionPauseMs: MC_OPTION_INTER_OPTION_PAUSE_MS,
        mcOptionWordPaceMs: WORD_REVEAL_PACE_MS
      },
      score: {
        player1: gameState.players.player1.score,
        player2: gameState.players.player2?.score || 0
      }
    });
    if (gameState.players.player2?.isAI) {
      this.handleAIBuzz(gameCode, question, roundId);
    }
    const noBuzzTimeoutMs = Math.max(0, buzzEndsAt - Date.now() + BUZZ_TIMEOUT_BUFFER_MS);
    gameState.buzzTimer = setTimeout(() => {
      this.handleNoBuzz(gameCode, roundId);
    }, noBuzzTimeoutMs);
  }
  handleAIBuzz(gameCode, question, expectedRoundId = null, forceBuzz = false) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState || !gameState.players.player2?.isAI) return;
    if (expectedRoundId !== null && gameState.roundId !== expectedRoundId) return;
    if (gameState.eligibleBuzzer && gameState.eligibleBuzzer !== 'player2') return;
    const aiResult = aiService.simulateAITurn(question, gameState.players.player2.difficulty);
    if (forceBuzz && !aiResult.didBuzz) {
      aiResult.didBuzz = true;
      aiResult.buzzTime = 350;
      aiResult.answerTime = aiResult.answerTime ?? 1000;
      aiResult.totalResponseTime = aiResult.buzzTime + aiResult.answerTime;
      if (!aiResult.answer) {
        aiResult.answer = toRuntimeFormat(question.format) === 'mc' ? 'W' : '';
      }
    }
    if (aiResult.didBuzz) {
      const earliestBuzzAt = Number(gameState.buzzWindowStart || gameState.questionReadEndsAt || 0);
      const delayUntilBuzzWindow = Math.max(0, earliestBuzzAt - Date.now());
      const scheduledDelay = Math.max(Number(aiResult.buzzTime || 0), delayUntilBuzzWindow);
      setTimeout(() => {
        const latestGameState = this.activeGames.get(gameCode);
        if (!latestGameState) return;
        if (expectedRoundId !== null && latestGameState.roundId !== expectedRoundId) return;
        if (latestGameState.phase !== 'buzzing') return;
        if (latestGameState.eligibleBuzzer && latestGameState.eligibleBuzzer !== 'player2') return;
        const latestEarliestBuzzAt = Number(latestGameState.buzzWindowStart || latestGameState.questionReadEndsAt || 0);
        if (Date.now() < latestEarliestBuzzAt) return;
        this.processAIBuzz(gameCode, aiResult);
      }, scheduledDelay);
    }
  }
  processAIBuzz(gameCode, aiResult) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    clearTimeout(gameState.buzzTimer);
    gameState.players.player2.buzzed = true;
    gameState.phase = 'answering';
    gameState.currentBuzzer = 'player2';
    gameState.currentBuzzerSocketId = null;
    gameState.answerResolved = false;
    const answerWindowEndsAt = Date.now() + Number(gameState.answerTime || 2000);
    this.io.to(gameCode).emit('game:buzzed', {
      playerId: 'player2',
      roundId: gameState.roundId,
      isAI: true,
      answerWindowSeconds: Math.ceil(Number(gameState.answerTime || 2000) / 1000),
      answerWindowEndsAt
    });
    const roundId = gameState.roundId;
    setTimeout(() => {
      const latestGameState = this.activeGames.get(gameCode);
      if (!latestGameState || latestGameState.roundId !== roundId) return;
      if (latestGameState.phase !== 'answering' || latestGameState.currentBuzzer !== 'player2') return;
      this.processAnswer(gameCode, 'player2', aiResult.answer, aiResult.totalResponseTime, roundId).catch(error => {
        console.error('AI answer processing error:', error);
      });
    }, aiResult.answerTime);
  }
  async startTeamBonus(gameCode, teamPlayerId, expectedRoundId = null) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    if (expectedRoundId !== null && gameState.roundId !== expectedRoundId) return;
    const game = await Game.findOne({
      gameCode
    });
    if (!game) return;
    const bonusIndex = (gameState.activeQuestionIndex ?? gameState.currentQuestion) + 1;
    if (bonusIndex >= game.questions.length) {
      this.finishCycle(gameCode, gameState.roundId);
      return;
    }
    const bonusQuestionData = game.questions[bonusIndex];
    const bonusQuestion = await Question.findById(bonusQuestionData.questionId);
    if (!bonusQuestion) return;
    const bonusFormat = toRuntimeFormat(bonusQuestion.format);
    const bonusCategory = bonusQuestion.category;
    const bonusAnswer = getCanonicalAnswer(bonusQuestion.answer);
    clearTimeout(gameState.answerTimer);
    clearTimeout(gameState.buzzTimer);
    gameState.phase = 'answering';
    gameState.currentQuestionKind = 'bonus';
    gameState.activeQuestionIndex = bonusIndex;
    gameState.currentBuzzer = teamPlayerId;
    gameState.currentBuzzerSocketId = null;
    gameState.eligibleBuzzer = null;
    gameState.answerResolved = false;
    const bonusReadWindow = getReadWindow({
      questionText: bonusQuestion.questionText,
      format: bonusFormat,
      choices: bonusQuestion.choices
    });
    gameState.questionReadStartedAt = bonusReadWindow.readStartedAt;
    gameState.questionTextReadEndsAt = bonusReadWindow.textReadEndsAt;
    gameState.questionReadEndsAt = bonusReadWindow.fullReadEndsAt;
    gameState.bonusAnswerStartsAt = gameState.questionReadEndsAt;
    gameState.bonusDeadlineAt = gameState.bonusAnswerStartsAt + 20000;
    gameState.typingState = {
      startWindowClosesAt: gameState.bonusAnswerStartsAt + getTypingStartWindowMs('bonus'),
      firstInputAt: null,
      lastInputAt: null,
      bestProgress: 0,
      lastProgressAt: null,
      hardCapAt: gameState.bonusDeadlineAt + TYPING_HARD_CAP_MS
    };
    gameState.buzzedAt = Date.now();
    gameState.currentPointValue = 10;
    gameState.questionStartScore = {
      player1: gameState.players.player1.score,
      player2: gameState.players.player2?.score || 0
    };
    gameState.currentQuestionData = {
      id: bonusQuestion._id,
      questionText: bonusQuestion.questionText,
      format: bonusFormat,
      category: bonusCategory,
      choices: bonusFormat === 'mc' ? bonusQuestion.choices : null,
      answer: bonusAnswer,
      startTime: Date.now(),
      kind: 'bonus',
      pointValue: 10
    };
    const roundId = gameState.roundId;
    const captainUserId = String(gameState.isTeamDuel ? teamPlayerId === 'player1' ? game?.settings?.team1?.captain?.userId || '' : game?.settings?.team2?.captain?.userId || '' : teamPlayerId === 'player1' ? gameState.players.player1?.userId || '' : gameState.players.player2?.userId || '');
    gameState.bonusResponderUserId = captainUserId || null;
    this.io.to(gameCode).emit('game:question', {
      questionNumber: gameState.currentCycle,
      totalQuestions: game.totalCycles || 10,
      roundId,
      question: {
        questionText: bonusQuestion.questionText,
        format: bonusFormat,
        category: bonusCategory,
        choices: bonusFormat === 'mc' ? bonusQuestion.choices : null,
        questionKind: 'bonus',
        pointValue: 10,
        captainOnly: true,
        bonusForTeam: teamPlayerId,
        wordPaceMs: WORD_REVEAL_PACE_MS,
        readStartedAt: gameState.questionReadStartedAt,
        readEndsAt: gameState.questionTextReadEndsAt,
        fullReadEndsAt: gameState.questionReadEndsAt,
        revealChoicesAfterRead: bonusFormat === 'mc',
        mcOptionPrefixPauseMs: MC_OPTION_PREFIX_PAUSE_MS,
        mcOptionInterOptionPauseMs: MC_OPTION_INTER_OPTION_PAUSE_MS,
        mcOptionWordPaceMs: WORD_REVEAL_PACE_MS
      },
      score: {
        player1: gameState.players.player1.score,
        player2: gameState.players.player2?.score || 0
      },
      bonusStartsAt: gameState.bonusAnswerStartsAt,
      bonusEndsAt: gameState.bonusDeadlineAt,
      bonusTimeLimitSeconds: 20,
      warningAtSeconds: 5
    });
    this.io.to(gameCode).emit('game:bonusStart', {
      roundId,
      bonusForTeam: teamPlayerId,
      captainOnly: true,
      bonusStartsAt: gameState.bonusAnswerStartsAt,
      timeLimitSeconds: 20,
      warningAtSeconds: 5
    });
    clearTimeout(gameState.questionTimer);
    const warningDelayMs = Math.max(0, gameState.bonusDeadlineAt - 5000 - Date.now());
    gameState.questionTimer = setTimeout(() => {
      const latest = this.activeGames.get(gameCode);
      if (!latest || latest.roundId !== roundId) return;
      if (latest.phase !== 'answering' || latest.currentQuestionKind !== 'bonus') return;
      this.io.to(gameCode).emit('game:bonusWarning', {
        roundId,
        secondsLeft: 5
      });
    }, warningDelayMs);
    this.scheduleAnswerDeadline(gameCode, roundId);
  }
  handleBuzz(socket, data) {
    const {
      gameCode
    } = data;
    const gameState = this.activeGames.get(gameCode);
    if (!gameState || gameState.phase !== 'buzzing') return;
    const playerInfo = this.playerRooms.get(socket.id);
    if (!playerInfo) return;
    if (gameState.eligibleBuzzer && gameState.eligibleBuzzer !== playerInfo.playerId) return;
    const player = gameState.players[playerInfo.playerId];
    if (player.buzzed) return;
    clearTimeout(gameState.buzzTimer);
    player.buzzed = true;
    gameState.phase = 'answering';
    gameState.currentBuzzer = playerInfo.playerId;
    gameState.currentBuzzerSocketId = socket.id;
    gameState.eligibleBuzzer = null;
    gameState.answerResolved = false;
    gameState.buzzedAt = Date.now();
    gameState.typingState = {
      startWindowClosesAt: Date.now() + getTypingStartWindowMs('tossup'),
      firstInputAt: null,
      lastInputAt: null,
      bestProgress: 0,
      lastProgressAt: null,
      hardCapAt: Date.now() + TYPING_HARD_CAP_MS
    };
    const answerWindowEndsAt = Date.now() + Number(gameState.answerTime || 2000);
    this.io.to(gameCode).emit('game:buzzed', {
      playerId: playerInfo.playerId,
      roundId: gameState.roundId,
      answerWindowSeconds: Math.ceil(Number(gameState.answerTime || 2000) / 1000),
      answerWindowEndsAt
    });
    const roundId = gameState.roundId;
    this.scheduleAnswerDeadline(gameCode, roundId);
  }
  handleInputActivity(socket, data) {
    const {
      gameCode
    } = data || {};
    const gameState = this.activeGames.get(gameCode);
    if (!gameState || gameState.phase !== 'answering') return;
    const playerInfo = this.playerRooms.get(socket.id);
    if (!playerInfo || playerInfo.playerId !== gameState.currentBuzzer) return;
    const now = Date.now();
    const reportedProgress = Number(data?.progress || 0);
    const reportedText = String(data?.text || '').slice(0, 500);
    gameState.typingState = gameState.typingState || {
      startWindowClosesAt: now + getTypingStartWindowMs(gameState.currentQuestionKind || 'tossup'),
      firstInputAt: null,
      lastInputAt: null,
      bestProgress: 0,
      lastProgressAt: null,
      hardCapAt: now + TYPING_HARD_CAP_MS
    };
    const progressChanged = reportedProgress > Number(gameState.typingState.bestProgress || 0);
    if (!gameState.typingState.firstInputAt && reportedProgress > 0) {
      gameState.typingState.firstInputAt = now;
    }
    gameState.typingState.lastInputAt = now;
    if (progressChanged) {
      gameState.typingState.bestProgress = reportedProgress;
      gameState.typingState.lastProgressAt = now;
    }
    this.io.to(gameCode).emit('game:answerActivity', {
      roundId: gameState.roundId,
      playerId: playerInfo.playerId,
      lastInputAt: now,
      progress: reportedProgress,
      progressChanged,
      lastProgressAt: gameState.typingState.lastProgressAt,
      text: reportedText
    });
  }
  scheduleAnswerDeadline(gameCode, expectedRoundId = null) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    if (expectedRoundId !== null && gameState.roundId !== expectedRoundId) return;
    if (gameState.phase !== 'answering') return;
    clearTimeout(gameState.answerTimer);
    if (gameState.currentQuestionKind === 'bonus') {
      const deadlineAt = Number(gameState.bonusDeadlineAt || 0);
      const now = Date.now();
      if (deadlineAt > now) {
        const remainingMs = Math.max(0, deadlineAt - now);
        gameState.answerTimer = setTimeout(() => {
          this.scheduleAnswerDeadline(gameCode, expectedRoundId);
        }, remainingMs);
        return;
      }
      const typingStateNow = gameState.typingState || {};
      const firstInputAtNow = Number(typingStateNow.firstInputAt || 0);
      const startedByDeadlineNow = firstInputAtNow > 0 && firstInputAtNow <= deadlineAt;
      if (!startedByDeadlineNow) {
        this.processAnswer(gameCode, gameState.currentBuzzer, null, 0, gameState.roundId).catch(error => {
          console.error('Immediate bonus timeout processing error:', error);
        });
        return;
      }
      gameState.answerTimer = setTimeout(() => {
        const latest = this.activeGames.get(gameCode);
        if (!latest) return;
        if (expectedRoundId !== null && latest.roundId !== expectedRoundId) return;
        if (latest.phase !== 'answering' || latest.currentQuestionKind !== 'bonus') return;
        const typingState = latest.typingState || {};
        const deadline = Number(latest.bonusDeadlineAt || 0);
        const firstInputAt = Number(typingState.firstInputAt || 0);
        const startedByDeadline = firstInputAt > 0 && firstInputAt <= deadline;
        if (!startedByDeadline) {
          this.processAnswer(gameCode, latest.currentBuzzer, null, 0, latest.roundId).catch(error => {
            console.error('Immediate bonus timeout processing error:', error);
          });
          return;
        }
        const progressAnchor = Math.max(Number(typingState.lastProgressAt || 0), deadline);
        const noProgressTooLong = Date.now() - progressAnchor >= TYPING_NO_PROGRESS_TIMEOUT_MS;
        const hardCap = Date.now() >= Number(typingState.hardCapAt || deadline + TYPING_HARD_CAP_MS);
        if (noProgressTooLong || hardCap) {
          this.processAnswer(gameCode, latest.currentBuzzer, null, 0, latest.roundId).catch(error => {
            console.error('Auto-timeout bonus processing error:', error);
          });
          return;
        }
        this.scheduleAnswerDeadline(gameCode, latest.roundId);
      }, 250);
      return;
    }
    gameState.answerTimer = setTimeout(() => {
      const latest = this.activeGames.get(gameCode);
      if (!latest) return;
      if (expectedRoundId !== null && latest.roundId !== expectedRoundId) return;
      if (latest.phase !== 'answering') return;
      const now = Date.now();
      const typingState = latest.typingState || {};
      const noStart = !typingState.firstInputAt && now >= Number(typingState.startWindowClosesAt || 0) + TYPING_START_GRACE_MS;
      const progressAnchor = Number(typingState.lastProgressAt || typingState.firstInputAt || 0);
      const idleTooLong = Boolean(progressAnchor && now - progressAnchor >= TYPING_NO_PROGRESS_TIMEOUT_MS);
      const hardCap = now >= Number(typingState.hardCapAt || 0);
      if (noStart || idleTooLong || hardCap) {
        this.processAnswer(gameCode, latest.currentBuzzer, null, 0, latest.roundId).catch(error => {
          console.error('Auto-timeout answer processing error:', error);
        });
        return;
      }
      this.scheduleAnswerDeadline(gameCode, latest.roundId);
    }, 250);
  }
  handleAnswer(socket, data) {
    const {
      gameCode,
      answer
    } = data;
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) {
      socket.emit('game:error', {
        code: 'ANSWER_REJECTED_NO_GAME',
        message: 'Game not found'
      });
      return;
    }
    if (gameState.phase !== 'answering') {
      socket.emit('game:error', {
        code: 'ANSWER_REJECTED_WINDOW_CLOSED',
        message: 'Answer window already closed',
        recoverPhase: gameState.phase
      });
      return;
    }
    const playerInfo = this.playerRooms.get(socket.id);
    if (!playerInfo || playerInfo.playerId !== gameState.currentBuzzer) {
      socket.emit('game:error', {
        code: 'ANSWER_REJECTED_NOT_BUZZER',
        message: 'Only the current buzzer can submit an answer',
        recoverPhase: gameState.phase
      });
      return;
    }
    if (gameState.isTeamDuel && gameState.currentQuestionKind !== 'bonus' && gameState.currentBuzzerSocketId && gameState.currentBuzzerSocketId !== socket.id) {
      socket.emit('game:error', {
        code: 'ANSWER_REJECTED_NOT_BUZZER',
        message: 'Only the player who buzzed can answer',
        recoverPhase: gameState.phase
      });
      return;
    }
    if (gameState.isTeamDuel && gameState.currentQuestionKind === 'bonus') {
      const expectedCaptainUserId = String(gameState.bonusResponderUserId || '');
      const currentUserId = String(socket.user?._id || '');
      if (expectedCaptainUserId && currentUserId !== expectedCaptainUserId) {
        socket.emit('game:error', {
          code: 'ANSWER_REJECTED_CAPTAIN_ONLY',
          message: 'Only the team captain can submit the bonus answer',
          recoverPhase: gameState.phase
        });
        return;
      }
    }
    clearTimeout(gameState.answerTimer);
    const responseTime = Math.max(0, Date.now() - Number(gameState.buzzedAt || Date.now()));
    this.processAnswer(gameCode, playerInfo.playerId, answer, responseTime, gameState.roundId).catch(error => {
      console.error('Player answer processing error:', error);
      socket.emit('game:error', {
        message: 'Failed to process answer'
      });
    });
  }
  async processAnswer(gameCode, playerId, answer, responseTime, expectedRoundId = null) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    if (expectedRoundId !== null && gameState.roundId !== expectedRoundId) return;
    if (gameState.phase !== 'answering') return;
    if (gameState.currentBuzzer !== playerId) return;
    if (gameState.answerResolved) return;
    gameState.answerResolved = true;
    clearTimeout(gameState.answerTimer);
    clearTimeout(gameState.questionTimer);
    const question = gameState.currentQuestionData;
    if (!question) return;
    const questionKind = question.kind || 'tossup';
    const isCorrect = Boolean(answer && this.checkAnswer(answer, question));
    const submittedAnswer = typeof answer === 'string' ? answer : '';
    const opponentId = playerId === 'player1' ? 'player2' : 'player1';
    const isInterrupt = questionKind === 'tossup' && Number(gameState.buzzedAt || 0) < Number(gameState.questionReadEndsAt || 0);
    const game = await Game.findOne({
      gameCode
    });
    if (!game) return;
    const qIndex = gameState.activeQuestionIndex;
    if (qIndex !== undefined && qIndex !== null && game.questions?.[qIndex]) {
      const responseKey = playerId === 'player1' ? 'player1Response' : 'player2Response';
      game.questions[qIndex][responseKey] = {
        answer: submittedAnswer || '',
        isCorrect,
        responseTime,
        didBuzz: true
      };
    }
    if (questionKind === 'bonus') {
      if (isCorrect) {
        gameState.players[playerId].score += 10;
        if (qIndex !== undefined && qIndex !== null && game.questions?.[qIndex]) {
          game.questions[qIndex].pointsAwarded[playerId] = 10;
        }
      }
      game.score.player1 = gameState.players.player1.score;
      game.score.player2 = gameState.players.player2?.score || 0;
      await game.save();
      this.io.to(gameCode).emit('game:answerResult', {
        playerId,
        answer: submittedAnswer || 'No answer',
        isCorrect,
        correctAnswer: question.answer,
        secondChanceAvailable: false,
        questionOver: true,
        questionNumber: gameState.currentCycle,
        questionKind: 'bonus',
        pointValue: 10,
        roundId: gameState.roundId,
        score: {
          player1: gameState.players.player1.score,
          player2: gameState.players.player2?.score || 0
        }
      });
      this.finishCycle(gameCode, gameState.roundId);
      return;
    }
    gameState.tossupAttempts = gameState.tossupAttempts || {
      player1: false,
      player2: false
    };
    gameState.tossupAttempts[playerId] = true;
    let resultTag = 'incorrect';
    if (isCorrect) {
      gameState.players[playerId].score += 4;
      if (qIndex !== undefined && qIndex !== null && game.questions?.[qIndex]) {
        game.questions[qIndex].pointsAwarded[playerId] = 4;
      }
      resultTag = 'correct';
    } else {
      const noPenaltyInterruptRestart = Boolean(gameState.secondChanceWasInterruptRestart);
      const penalty = noPenaltyInterruptRestart ? 0 : -4;
      gameState.players[playerId].score += penalty;
      if (qIndex !== undefined && qIndex !== null && game.questions?.[qIndex]) {
        game.questions[qIndex].pointsAwarded[playerId] = penalty;
      }
      resultTag = isInterrupt ? noPenaltyInterruptRestart ? 'interrupt_no_penalty' : 'interrupt' : 'incorrect';
    }
    game.score.player1 = gameState.players.player1.score;
    game.score.player2 = gameState.players.player2?.score || 0;
    await game.save();
    this.io.to(gameCode).emit('game:answerResult', {
      playerId,
      answer: submittedAnswer || 'No answer',
      isCorrect,
      correctAnswer: question.answer,
      secondChanceAvailable: !isCorrect,
      secondChancePlayer: !isCorrect ? opponentId : null,
      questionOver: Boolean(isCorrect),
      questionNumber: gameState.currentCycle,
      questionKind: 'tossup',
      pointValue: 4,
      roundId: gameState.roundId,
      resultTag,
      wasInterrupt: Boolean(isInterrupt),
      score: {
        player1: gameState.players.player1.score,
        player2: gameState.players.player2?.score || 0
      }
    });
    if (isCorrect) {
      if (!gameState.suddenDeath) {
        const roundId = gameState.roundId;
        gameState.transitionTimer = setTimeout(() => {
          this.startTeamBonus(gameCode, playerId, roundId).catch(error => {
            console.error('Team bonus start error:', error);
          });
        }, 1000);
      } else {
        this.finishCycle(gameCode, gameState.roundId);
      }
      return;
    }
    const opponentAlreadyAttempted = Boolean(gameState.tossupAttempts[opponentId]);
    if (opponentAlreadyAttempted) {
      this.finishCycle(gameCode, gameState.roundId);
      return;
    }
    if (isInterrupt) {
      const roundId = gameState.roundId;
      gameState.transitionTimer = setTimeout(() => {
        try {
          this.startSecondChanceBuzz(gameCode, opponentId, roundId, true);
        } catch (error) {
          console.error('Second-chance restart error:', error);
          this.finishCycle(gameCode, roundId);
        }
      }, 800);
      return;
    }
    const roundId = gameState.roundId;
    gameState.transitionTimer = setTimeout(() => {
      try {
        this.startSecondChanceBuzz(gameCode, opponentId, roundId, false);
      } catch (error) {
        console.error('Second-chance window error:', error);
        this.finishCycle(gameCode, roundId);
      }
    }, 800);
  }
  startSecondChanceBuzz(gameCode, eligiblePlayerId, expectedRoundId = null, restartReading = false) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState || gameState.phase === 'complete') return;
    if (expectedRoundId !== null && gameState.roundId !== expectedRoundId) return;
    clearTimeout(gameState.buzzTimer);
    gameState.phase = 'buzzing';
    gameState.currentBuzzer = null;
    gameState.currentBuzzerSocketId = null;
    gameState.answerResolved = false;
    gameState.eligibleBuzzer = eligiblePlayerId;
    gameState.typingState = null;
    gameState.secondChanceWasInterruptRestart = Boolean(restartReading);
    let buzzStartsAt = Date.now();
    let buzzEndsAt = buzzStartsAt + TEAM_DUEL_TOSSUP_BUZZ_MS;
    let buzzWindowTime = TEAM_DUEL_TOSSUP_BUZZ_MS;
    if (restartReading && gameState.currentQuestionData?.questionText) {
      const readWindow = getReadWindow({
        questionText: gameState.currentQuestionData.questionText,
        format: gameState.currentQuestionData.format,
        choices: gameState.currentQuestionData.choices
      });
      gameState.questionReadStartedAt = readWindow.readStartedAt;
      gameState.questionTextReadEndsAt = readWindow.textReadEndsAt;
      gameState.questionReadEndsAt = readWindow.fullReadEndsAt;
      buzzStartsAt = gameState.questionReadEndsAt;
      buzzEndsAt = buzzStartsAt + POST_READ_BUZZ_MS;
      buzzWindowTime = POST_READ_BUZZ_MS;
      this.io.to(gameCode).emit('game:question', {
        questionNumber: gameState.currentCycle,
        totalQuestions: gameState.totalCycles || 10,
        roundId: gameState.roundId,
        suddenDeath: Boolean(gameState.suddenDeath),
        restartFor: eligiblePlayerId,
        buzzWindowTime,
        buzzStartsAt,
        buzzEndsAt,
        question: {
          questionText: gameState.currentQuestionData.questionText,
          format: gameState.currentQuestionData.format,
          category: gameState.currentQuestionData.category,
          choices: gameState.currentQuestionData.format === 'mc' ? gameState.currentQuestionData.choices : null,
          questionKind: 'tossup',
          pointValue: 4,
          wordPaceMs: WORD_REVEAL_PACE_MS,
          readStartedAt: gameState.questionReadStartedAt,
          readEndsAt: gameState.questionTextReadEndsAt,
          fullReadEndsAt: gameState.questionReadEndsAt,
          revealChoicesAfterRead: gameState.currentQuestionData.format === 'mc',
          mcOptionPrefixPauseMs: MC_OPTION_PREFIX_PAUSE_MS,
          mcOptionInterOptionPauseMs: MC_OPTION_INTER_OPTION_PAUSE_MS,
          mcOptionWordPaceMs: WORD_REVEAL_PACE_MS
        },
        score: {
          player1: gameState.players.player1.score,
          player2: gameState.players.player2?.score || 0
        }
      });
    }
    gameState.buzzWindowStart = buzzStartsAt;
    gameState.buzzWindowEnd = buzzEndsAt;
    this.io.to(gameCode).emit('game:secondChance', {
      eligiblePlayerId,
      buzzWindowTime,
      buzzStartsAt,
      buzzEndsAt,
      questionNumber: gameState.currentCycle,
      roundId: gameState.roundId,
      restartReading: Boolean(restartReading)
    });
    if (gameState.players.player2?.isAI && eligiblePlayerId === 'player2') {
      this.handleAIBuzz(gameCode, gameState.currentQuestionData, gameState.roundId, true);
    }
    const noBuzzTimeoutMs = Math.max(0, buzzEndsAt - Date.now() + BUZZ_TIMEOUT_BUFFER_MS);
    gameState.buzzTimer = setTimeout(() => {
      this.handleNoBuzz(gameCode, gameState.roundId);
    }, noBuzzTimeoutMs);
  }
  handleNoBuzz(gameCode, expectedRoundId = null) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    if (expectedRoundId !== null && gameState.roundId !== expectedRoundId) return;
    if (gameState.phase !== 'buzzing') return;
    gameState.phase = 'review';
    gameState.eligibleBuzzer = null;
    const anyPlayerBuzzed = Boolean(gameState.players.player1?.buzzed || gameState.players.player2?.buzzed);
    this.io.to(gameCode).emit('game:noBuzz', {
      correctAnswer: gameState.currentQuestionData?.answer || null,
      questionOver: true,
      allowProtest: false,
      questionNumber: gameState.currentCycle,
      roundId: gameState.roundId,
      score: {
        player1: gameState.players.player1.score,
        player2: gameState.players.player2?.score || 0
      }
    });
    this.finishCycle(gameCode, gameState.roundId);
  }
  finishCycle(gameCode, expectedRoundId = null) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    if (expectedRoundId !== null && gameState.roundId !== expectedRoundId) return;
    if (gameState.phase === 'complete') return;
    clearTimeout(gameState.buzzTimer);
    clearTimeout(gameState.answerTimer);
    clearTimeout(gameState.transitionTimer);
    gameState.phase = 'review';
    gameState.eligibleBuzzer = null;
    gameState.currentBuzzer = null;
    gameState.currentBuzzerSocketId = null;
    gameState.answerResolved = false;
    gameState.typingState = null;
    if (gameState.lastCompletedRoundId !== gameState.roundId) {
      gameState.completedCycles = Number(gameState.completedCycles || 0) + 1;
      gameState.lastCompletedRoundId = gameState.roundId;
    }
    this.closeQuestionAndAdvance(gameCode, gameState.roundId, null);
  }
  beginQuestionClosure(gameCode, closureConfig) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    if (closureConfig.expectedRoundId !== null && gameState.roundId !== closureConfig.expectedRoundId) return;
    clearTimeout(gameState.protestTimer);
    clearTimeout(gameState.protestVoteTimer);
    const existingCtx = gameState.protestContext && gameState.protestContext.roundId === gameState.roundId ? gameState.protestContext : null;
    gameState.protestContext = {
      roundId: gameState.roundId,
      questionNumber: gameState.currentCycle,
      canProtest: Boolean(closureConfig.canProtest),
      targetPlayerId: closureConfig.targetPlayerId,
      protestedAnswer: closureConfig.protestedAnswer || '',
      initialIsCorrect: Boolean(closureConfig.initialIsCorrect),
      status: existingCtx?.status || 'open',
      protestedBy: existingCtx?.protestedBy || [],
      claims: existingCtx?.claims || {
        player1: {
          ownAnswerAccepted: false,
          opponentAnswerRejected: false
        },
        player2: {
          ownAnswerAccepted: false,
          opponentAnswerRejected: false
        }
      },
      overrides: existingCtx?.overrides || {
        player1: null,
        player2: null
      },
      actions: existingCtx?.actions || [],
      windowClosesAt: existingCtx?.windowClosesAt || 0,
      resolution: null,
      revealDurationMs: closureConfig.revealDurationMs ?? 5500
    };
    this.io.to(gameCode).emit('game:protestState', {
      roundId: gameState.protestContext.roundId,
      questionNumber: gameState.protestContext.questionNumber,
      canProtest: gameState.protestContext.canProtest,
      status: gameState.protestContext.status,
      targetPlayerId: gameState.protestContext.targetPlayerId || null,
      secondsLeft: computeSecondsLeft(gameState.protestContext.windowClosesAt || 0),
      protestedBy: [],
      protestedByNames: [],
      claims: gameState.protestContext.claims,
      actions: gameState.protestContext.actions
    });
    const protestWindowMs = closureConfig.protestWindowMs ?? 0;
    if (protestWindowMs <= 0) {
      this.closeQuestionAndAdvance(gameCode, gameState.roundId, gameState.protestContext.resolution);
      return;
    }
    gameState.protestTimer = setTimeout(() => {
      const latestGameState = this.activeGames.get(gameCode);
      if (!latestGameState) return;
      if (!latestGameState.protestContext || latestGameState.protestContext.roundId !== closureConfig.expectedRoundId) return;
      this.closeQuestionAndAdvance(gameCode, latestGameState.roundId, latestGameState.protestContext.resolution);
    }, protestWindowMs);
  }
  async handleProtest(socket, data) {
    try {
      const {
        gameCode
      } = data;
      const gameState = this.activeGames.get(gameCode);
      if (!gameState || gameState.phase !== 'review') return;
      if (!gameState.protestContext || gameState.protestContext.roundId !== gameState.roundId) {
        gameState.protestContext = {
          roundId: gameState.roundId,
          questionNumber: gameState.isTeamDuel ? gameState.currentCycle : gameState.currentQuestion + 1,
          canProtest: true,
          targetPlayerId: null,
          protestedAnswer: '',
          initialIsCorrect: false,
          status: 'open',
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
          resolution: null,
          revealDurationMs: 0
        };
      }
      const protest = gameState.protestContext;
      if (!protest || protest.roundId !== gameState.roundId || !protest.canProtest) return;
      if (!protest.targetPlayerId) return;
      if (!protest.windowClosesAt || Date.now() > protest.windowClosesAt) {
        socket.emit('game:error', {
          message: 'Protest window has closed for this answer.'
        });
        return;
      }
      const playerInfo = this.playerRooms.get(socket.id);
      if (!playerInfo) return;
      const game = await Game.findOne({
        gameCode
      });
      if (game) {
        const questionIndex = gameState.activeQuestionIndex ?? gameState.currentQuestion;
        if (!game.questions?.[questionIndex]) return;
        const questionDoc = game.questions[questionIndex];
        const responseState = getQuestionResponseState(questionDoc);
        const playerId = playerInfo.playerId;
        const opponentId = playerId === 'player1' ? 'player2' : 'player1';
        const targetPlayerId = protest.targetPlayerId;
        const protestDoc = questionDoc.protest || {};
        protestDoc.claims = protestDoc.claims || {
          player1: {
            ownAnswerAccepted: false,
            opponentAnswerRejected: false
          },
          player2: {
            ownAnswerAccepted: false,
            opponentAnswerRejected: false
          }
        };
        protestDoc.claims[playerId] = protestDoc.claims[playerId] || {
          ownAnswerAccepted: false,
          opponentAnswerRejected: false
        };
        protestDoc.overrides = protestDoc.overrides || {
          player1: null,
          player2: null
        };
        protestDoc.actions = protestDoc.actions || [];
        const targetAnswered = targetPlayerId === 'player1' ? responseState.player1Answered : responseState.player2Answered;
        if (!targetAnswered) {
          socket.emit('game:error', {
            message: 'No answer available to protest in this popup.'
          });
          return;
        }
        const targetResponseKey = `${targetPlayerId}Response`;
        const targetResponse = questionDoc[targetResponseKey] || {};
        const desiredIsCorrect = !Boolean(targetResponse.isCorrect);
        protestDoc.overrides[targetPlayerId] = desiredIsCorrect;
        const existingActionIndex = protestDoc.actions.findIndex(a => a?.protester === playerId && a?.targetPlayerId === targetPlayerId);
        const actionPayload = {
          protester: playerId,
          targetPlayerId,
          desiredIsCorrect,
          createdAt: new Date()
        };
        if (existingActionIndex >= 0) {
          protestDoc.actions[existingActionIndex] = actionPayload;
        } else {
          protestDoc.actions.push(actionPayload);
        }
        protestDoc.protestedBy = ['player1', 'player2'].filter(pid => {
          return protestDoc.actions.some(a => a?.protester === pid);
        });
        protest.claims = protestDoc.claims;
        protest.overrides = protestDoc.overrides;
        protest.actions = protestDoc.actions;
        protest.protestedBy = protestDoc.protestedBy;
        protestDoc.votes = protestDoc.votes || {
          player1: null,
          player2: null
        };
        protestDoc.resolved = protestDoc.resolved || false;
        protestDoc.accepted = protestDoc.accepted ?? null;
        protestDoc.decidedBy = protestDoc.decidedBy ?? null;
        protestDoc.rationale = protestDoc.rationale || '';
        if (game.player2?.isAI && !protestDoc.resolved) {
          protestDoc.votes = {
            player1: 'accept',
            player2: 'accept'
          };
          protestDoc.resolved = true;
          protestDoc.accepted = true;
          protestDoc.decidedBy = 'players';
          protestDoc.rationale = 'AI auto-accepted the protest.';
          protestDoc.resolvedAt = new Date();
          questionDoc.protest = protestDoc;
          applyAcceptedProtestClaimsToQuestion(questionDoc);
          const recalculated = (game.questions || []).reduce((acc, q) => {
            acc.player1 += Number(q?.pointsAwarded?.player1 || 0);
            acc.player2 += Number(q?.pointsAwarded?.player2 || 0);
            return acc;
          }, {
            player1: 0,
            player2: 0
          });
          game.score.player1 = recalculated.player1;
          game.score.player2 = recalculated.player2;
          if (gameState.players?.player1) gameState.players.player1.score = game.score.player1;
          if (gameState.players?.player2) gameState.players.player2.score = game.score.player2;
        }
        questionDoc.protest = protestDoc;
        await game.save();
      }
      this.io.to(gameCode).emit('game:protestState', {
        roundId: protest.roundId,
        questionNumber: protest.questionNumber,
        canProtest: protest.canProtest,
        status: game?.questions?.[gameState.currentQuestion]?.protest?.resolved ? 'resolved' : protest.status,
        targetPlayerId: protest.targetPlayerId,
        secondsLeft: computeSecondsLeft(protest.windowClosesAt || 0),
        protestedBy: protest.protestedBy,
        protestedByNames: mapProtesterNames(gameState, protest.protestedBy),
        claims: protest.claims || null,
        actions: protest.actions || []
      });
      const persistedProtest = game?.questions?.[gameState.currentQuestion]?.protest;
      if (persistedProtest?.resolved) {
        this.io.to(gameCode).emit('game:protestResolved', {
          roundId: protest.roundId,
          questionNumber: protest.questionNumber,
          status: 'resolved',
          protestedBy: persistedProtest.protestedBy || [],
          protestedByNames: mapProtesterNames(gameState, persistedProtest.protestedBy || []),
          targetPlayerId: protest.targetPlayerId,
          claims: persistedProtest.claims || null,
          actions: persistedProtest.actions || [],
          accepted: persistedProtest.accepted,
          decidedBy: persistedProtest.decidedBy,
          rationale: persistedProtest.rationale,
          score: {
            player1: gameState.players.player1.score,
            player2: gameState.players.player2?.score || 0
          }
        });
      }
    } catch (error) {
      console.error('handleProtest error:', error);
      socket.emit('game:error', {
        message: 'Failed to submit protest'
      });
    }
  }
  handleProtestVote(socket, data) {
    return;
  }
  handleProtestAdjustStart(socket, data) {
    const {
      gameCode
    } = data;
    const gameState = this.activeGames.get(gameCode);
    if (!gameState || !['review', 'review_closed'].includes(String(gameState.phase || ''))) return;
    const playerInfo = this.playerRooms.get(socket.id);
    if (!playerInfo) return;
    const ctx = gameState.protestAdjustContext;
    if (!ctx || ctx.roundId !== gameState.roundId) return;
    if (ctx.cancelled) return;
    const now = Date.now();
    const canStartFromWindow = ctx.phase === 'window' && now <= Number(ctx.windowEndsAt || 0);
    const canRecoverAfterWindow = ctx.phase === 'closed' && !ctx.proposal && now <= Number(ctx.windowEndsAt || 0) + 10000;
    if (!canStartFromWindow && !canRecoverAfterWindow) return;
    ctx.phase = 'selecting';
    ctx.selector = playerInfo.playerId;
    ctx.proposer = playerInfo.playerId;
    ctx.awaitingResponder = playerInfo.playerId === 'player1' ? 'player2' : 'player1';
    ctx.proposal = null;
    ctx.rounds = Number(ctx.rounds || 0);
    ctx.proposals = Array.isArray(ctx.proposals) ? ctx.proposals : [];
    ctx.selectionEndsAt = Date.now() + 10000;
    this.pauseNextAdvanceCountdown(gameCode, gameState.roundId);
    clearTimeout(gameState.protestAdjustTimer);
    gameState.protestAdjustTimer = setTimeout(() => {
      const latest = this.activeGames.get(gameCode);
      if (!latest) return;
      const latestCtx = latest.protestAdjustContext;
      if (!latestCtx || latestCtx.roundId !== latest.roundId) return;
      if (latestCtx.phase !== 'selecting') return;
      latestCtx.phase = 'closed';
      latestCtx.selector = null;
      latestCtx.selectionEndsAt = null;
      latestCtx.statusMessage = null;
      this.io.to(gameCode).emit('game:protestAdjustState', {
        roundId: latestCtx.roundId,
        phase: latestCtx.phase,
        windowEndsAt: latestCtx.windowEndsAt,
        selectionEndsAt: latestCtx.selectionEndsAt,
        responseEndsAt: latestCtx.responseEndsAt,
        selector: latestCtx.selector,
        proposer: latestCtx.proposer,
        awaitingResponder: latestCtx.awaitingResponder,
        proposal: latestCtx.proposal,
        pointValue: latestCtx.pointValue,
        allowedPairs: latestCtx.allowedPairs,
        allowedDeltas: latestCtx.allowedDeltas,
        appliedBy: latestCtx.appliedBy || null,
        deltas: latestCtx.deltas || null
      });
      this.resumeNextAdvanceCountdown(gameCode, latestCtx.roundId);
    }, 10000);
    this.io.to(gameCode).emit('game:protestAdjustState', {
      roundId: ctx.roundId,
      phase: ctx.phase,
      windowEndsAt: ctx.windowEndsAt,
      selectionEndsAt: ctx.selectionEndsAt,
      selector: ctx.selector,
      proposer: ctx.proposer,
      awaitingResponder: ctx.awaitingResponder,
      proposal: ctx.proposal,
      pointValue: ctx.pointValue,
      allowedPairs: ctx.allowedPairs,
      allowedDeltas: ctx.allowedDeltas,
      appliedBy: ctx.appliedBy || null,
      deltas: ctx.deltas || null
    });
    this.emitNextReadyState(gameCode);
  }
  handleProtestAdjustCancel(socket, data) {
    const {
      gameCode
    } = data || {};
    const gameState = this.activeGames.get(gameCode);
    if (!gameState || !['review', 'review_closed'].includes(String(gameState.phase || ''))) return;
    const playerInfo = this.playerRooms.get(socket.id);
    if (!playerInfo) return;
    const ctx = gameState.protestAdjustContext;
    if (!ctx || ctx.roundId !== gameState.roundId) return;
    if (!['selecting', 'awaiting_response'].includes(String(ctx.phase || ''))) return;
    const canCancel = ctx.phase === 'selecting' && String(ctx.selector || '') === String(playerInfo.playerId || '') || ctx.phase === 'awaiting_response' && String(ctx.proposer || '') === String(playerInfo.playerId || '');
    if (!canCancel) return;
    clearTimeout(gameState.protestAdjustTimer);
    ctx.phase = 'closed';
    ctx.cancelled = true;
    ctx.selector = null;
    ctx.awaitingResponder = null;
    ctx.selectionEndsAt = null;
    ctx.responseEndsAt = null;
    ctx.proposal = null;
    ctx.statusMessage = 'Protest cancelled';
    this.io.to(gameCode).emit('game:protestAdjustState', {
      roundId: ctx.roundId,
      phase: ctx.phase,
      windowEndsAt: ctx.windowEndsAt,
      selectionEndsAt: ctx.selectionEndsAt,
      responseEndsAt: ctx.responseEndsAt,
      selector: ctx.selector,
      proposer: ctx.proposer,
      awaitingResponder: ctx.awaitingResponder,
      proposal: ctx.proposal,
      pointValue: ctx.pointValue,
      allowedPairs: ctx.allowedPairs,
      allowedDeltas: ctx.allowedDeltas,
      appliedBy: ctx.appliedBy || null,
      deltas: ctx.deltas || null,
      score: {
        player1: gameState.players.player1.score,
        player2: gameState.players.player2?.score || 0
      },
      statusMessage: ctx.statusMessage
    });
    this.resumeNextAdvanceCountdown(gameCode, gameState.roundId);
    this.emitNextReadyState(gameCode);
  }
  async handleProtestAdjustSubmit(socket, data) {
    try {
      const {
        gameCode,
        myDelta,
        opponentDelta
      } = data;
      const gameState = this.activeGames.get(gameCode);
      if (!gameState || !['review', 'review_closed'].includes(String(gameState.phase || ''))) return;
      const playerInfo = this.playerRooms.get(socket.id);
      if (!playerInfo) return;
      const ctx = gameState.protestAdjustContext;
      if (!ctx || ctx.roundId !== gameState.roundId) return;
      if (ctx.phase !== 'selecting' || ctx.selector !== playerInfo.playerId) return;
      if (!ctx.selectionEndsAt || Date.now() > ctx.selectionEndsAt) return;
      const ownDelta = Number(myDelta);
      const oppDelta = Number(opponentDelta);
      const allowedPairs = getAllowedProtestPairs(ctx);
      if (!Number.isFinite(ownDelta) || !Number.isFinite(oppDelta) || !isAllowedProtestPair(ownDelta, oppDelta, allowedPairs)) {
        socket.emit('game:error', {
          message: 'Invalid protest adjustment values.'
        });
        return;
      }
      const submitterId = playerInfo.playerId;
      const proposal = {
        player1Delta: submitterId === 'player1' ? ownDelta : oppDelta,
        player2Delta: submitterId === 'player2' ? ownDelta : oppDelta
      };
      ctx.proposal = proposal;
      ctx.proposer = submitterId;
      ctx.awaitingResponder = submitterId === 'player1' ? 'player2' : 'player1';
      ctx.phase = 'awaiting_response';
      ctx.selector = null;
      ctx.selectionEndsAt = null;
      ctx.responseEndsAt = Date.now() + 10000;
      ctx.proposals = Array.isArray(ctx.proposals) ? ctx.proposals : [];
      ctx.proposals.push({
        by: submitterId,
        ...proposal,
        createdAt: new Date()
      });
      clearTimeout(gameState.protestAdjustTimer);
      gameState.protestAdjustTimer = setTimeout(() => {
        const latest = this.activeGames.get(gameCode);
        if (!latest) return;
        const latestCtx = latest.protestAdjustContext;
        if (!latestCtx || latestCtx.roundId !== latest.roundId) return;
        if (latestCtx.phase !== 'awaiting_response') return;
        this.resolveProtestAdjustmentAsync(gameCode, latestCtx.roundId).catch(error => {
          console.error('resolveProtestAdjustmentAsync (response timeout) error:', error);
        });
      }, 10000);
      this.io.to(gameCode).emit('game:protestAdjustState', {
        roundId: ctx.roundId,
        phase: ctx.phase,
        windowEndsAt: ctx.windowEndsAt,
        selectionEndsAt: ctx.selectionEndsAt,
        responseEndsAt: ctx.responseEndsAt,
        selector: ctx.selector,
        proposer: ctx.proposer,
        awaitingResponder: ctx.awaitingResponder,
        proposal: ctx.proposal,
        pointValue: ctx.pointValue,
        allowedPairs: ctx.allowedPairs,
        allowedDeltas: ctx.allowedDeltas,
        appliedBy: ctx.appliedBy,
        deltas: ctx.deltas,
        score: {
          player1: gameState.players.player1.score,
          player2: gameState.players.player2?.score || 0
        }
      });
    } catch (error) {
      console.error('handleProtestAdjustSubmit error:', error);
      socket.emit('game:error', {
        message: 'Failed to submit protest adjustment.'
      });
    }
  }
  async handleProtestAdjustRespond(socket, data) {
    try {
      const {
        gameCode,
        decision
      } = data;
      const normalizedDecision = ['accept', 'reject', 'counter'].includes(String(decision || '')) ? String(decision) : 'reject';
      const gameState = this.activeGames.get(gameCode);
      if (!gameState || !['review', 'review_closed'].includes(String(gameState.phase || ''))) return;
      const playerInfo = this.playerRooms.get(socket.id);
      if (!playerInfo) return;
      const ctx = gameState.protestAdjustContext;
      if (!ctx || ctx.roundId !== gameState.roundId) return;
      if (ctx.phase !== 'awaiting_response') return;
      if (String(ctx.awaitingResponder || '') !== String(playerInfo.playerId || '')) return;
      if (normalizedDecision === 'accept' && ctx.proposal) {
        const game = await Game.findOne({
          gameCode
        });
        const questionIndex = gameState.activeQuestionIndex ?? gameState.currentQuestion;
        if (game && game.questions?.[questionIndex]) {
          const q = game.questions[questionIndex];
          applyCycleDeltaProposal(game, Number(ctx.cycleNumber || gameState.currentCycle || 1), ctx.proposal);
          q.protest = q.protest || {};
          q.protest.negotiation = q.protest.negotiation || {
            state: 'none',
            history: []
          };
          q.protest.negotiation.state = 'resolved';
          q.protest.negotiation.history = q.protest.negotiation.history || [];
          q.protest.negotiation.history.push({
            by: playerInfo.playerId,
            kind: 'accept',
            proposal: {
              player1Delta: Number(ctx.proposal.player1Delta || 0),
              player2Delta: Number(ctx.proposal.player2Delta || 0)
            },
            createdAt: new Date()
          });
          q.protest.resolved = true;
          q.protest.accepted = true;
          q.protest.decidedBy = 'players';
          q.protest.rationale = 'Accepted in live protest negotiation.';
          q.protest.resolvedAt = new Date();
          recalculateGameScoreFromQuestions(game);
          await game.save();
          gameState.players.player1.score = game.score.player1;
          if (gameState.players?.player2) gameState.players.player2.score = game.score.player2;
        }
        ctx.phase = 'applied';
        ctx.appliedBy = playerInfo.playerId;
        ctx.deltas = {
          player1: Number(ctx.proposal.player1Delta || 0),
          player2: Number(ctx.proposal.player2Delta || 0)
        };
        ctx.statusMessage = 'Protest resolved';
        clearTimeout(gameState.protestAdjustTimer);
        this.resumeNextAdvanceCountdown(gameCode, gameState.roundId);
      } else if (normalizedDecision === 'counter') {
        ctx.rounds = Number(ctx.rounds || 0) + 1;
        ctx.phase = 'selecting';
        ctx.selector = playerInfo.playerId;
        ctx.selectionEndsAt = Date.now() + 10000;
        ctx.responseEndsAt = null;
        ctx.awaitingResponder = playerInfo.playerId === 'player1' ? 'player2' : 'player1';
        clearTimeout(gameState.protestAdjustTimer);
        gameState.protestAdjustTimer = setTimeout(() => {
          const latest = this.activeGames.get(gameCode);
          if (!latest) return;
          const latestCtx = latest.protestAdjustContext;
          if (!latestCtx || latestCtx.roundId !== latest.roundId) return;
          if (latestCtx.phase !== 'selecting') return;
          this.resolveProtestAdjustmentAsync(gameCode, latestCtx.roundId).catch(error => {
            console.error('resolveProtestAdjustmentAsync (counter selection timeout) error:', error);
          });
        }, 10000);
      } else {
        await this.resolveProtestAdjustmentAsync(gameCode, gameState.roundId, {
          by: playerInfo.playerId,
          kind: 'reject'
        });
        this.emitNextReadyState(gameCode);
        return;
      }
      this.io.to(gameCode).emit('game:protestAdjustState', {
        roundId: ctx.roundId,
        phase: ctx.phase,
        windowEndsAt: ctx.windowEndsAt,
        selectionEndsAt: ctx.selectionEndsAt,
        responseEndsAt: ctx.responseEndsAt,
        selector: ctx.selector,
        proposer: ctx.proposer,
        awaitingResponder: ctx.awaitingResponder,
        proposal: ctx.proposal,
        pointValue: ctx.pointValue,
        allowedPairs: ctx.allowedPairs,
        allowedDeltas: ctx.allowedDeltas,
        appliedBy: ctx.appliedBy || null,
        deltas: ctx.deltas || null,
        score: {
          player1: gameState.players.player1.score,
          player2: gameState.players.player2?.score || 0
        }
      });
      this.emitNextReadyState(gameCode);
    } catch (error) {
      console.error('handleProtestAdjustRespond error:', error);
      socket.emit('game:error', {
        message: 'Failed to respond to protest adjustment.'
      });
    }
  }
  async resolveProtestAdjustmentAsync(gameCode, roundId, historyEvent = null) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    const ctx = gameState.protestAdjustContext;
    if (!ctx || ctx.roundId !== roundId) return;
    clearTimeout(gameState.protestAdjustTimer);
    ctx.phase = 'pending_ai';
    ctx.statusMessage = 'Protest noted';
    this.io.to(gameCode).emit('game:protestAdjustState', {
      roundId: ctx.roundId,
      phase: ctx.phase,
      selector: null,
      proposer: ctx.proposer,
      awaitingResponder: ctx.awaitingResponder,
      proposal: ctx.proposal,
      pointValue: ctx.pointValue,
      allowedPairs: ctx.allowedPairs,
      allowedDeltas: ctx.allowedDeltas,
      appliedBy: ctx.appliedBy || null,
      deltas: ctx.deltas || null
    });
    this.resumeNextAdvanceCountdown(gameCode, roundId);
    const game = await Game.findOne({
      gameCode
    }).populate('questions.questionId');
    if (!game) return;
    const questionIndex = gameState.activeQuestionIndex ?? gameState.currentQuestion;
    const q = game.questions?.[questionIndex];
    if (!q) return;
    q.protest = q.protest || {};
    q.protest.negotiation = q.protest.negotiation || {
      state: 'none',
      history: []
    };
    q.protest.negotiation.state = 'pending_ai';
    q.protest.negotiation.history = q.protest.negotiation.history || [];
    if (historyEvent) {
      q.protest.negotiation.history.push({
        by: historyEvent.by || 'player1',
        kind: historyEvent.kind || 'appeal',
        proposal: null,
        createdAt: new Date()
      });
    }
    (ctx.proposals || []).forEach(proposal => {
      q.protest.negotiation.history.push({
        by: proposal.by,
        kind: 'proposal',
        proposal: {
          player1Delta: Number(proposal.player1Delta || 0),
          player2Delta: Number(proposal.player2Delta || 0)
        },
        createdAt: proposal.createdAt || new Date()
      });
    });
    await game.save();
    setTimeout(async () => {
      try {
        const fresh = await Game.findOne({
          gameCode
        }).populate('questions.questionId');
        if (!fresh) return;
        const target = fresh.questions?.[questionIndex];
        if (!target) return;
        const proposals = (ctx.proposals || []).map(proposal => ({
          player1Delta: Number(proposal.player1Delta || 0),
          player2Delta: Number(proposal.player2Delta || 0)
        }));
        const decision = await protestNegotiationService.decide({
          questionText: target.questionId?.questionText || '',
          correctAnswer: getCanonicalAnswer(target.questionId?.answer) || '',
          responses: {
            player1: target.player1Response || {},
            player2: target.player2Response || {}
          },
          proposals
        });
        target.protest = target.protest || {};
        target.protest.negotiation = target.protest.negotiation || {
          state: 'none',
          history: []
        };
        target.protest.negotiation.state = 'resolved';
        target.protest.negotiation.aiDecision = {
          accepted: Boolean(decision.accepted),
          chosenProposal: decision.chosenProposal || null,
          rationale: decision.rationale || '',
          decidedAt: new Date()
        };
        if (decision.accepted && decision.chosenProposal) {
          applyCycleDeltaProposal(fresh, Number(ctx.cycleNumber || 1), decision.chosenProposal);
          target.protest.resolved = true;
          target.protest.accepted = true;
          target.protest.decidedBy = 'gemini';
          target.protest.rationale = decision.rationale || 'Resolved by AI adjudication.';
          target.protest.resolvedAt = new Date();
        } else {
          target.protest.resolved = true;
          target.protest.accepted = false;
          target.protest.decidedBy = 'gemini';
          target.protest.rationale = decision.rationale || 'Rejected by AI adjudication.';
          target.protest.resolvedAt = new Date();
        }
        recalculateGameScoreFromQuestions(fresh);
        await fresh.save();
      } catch (error) {
        console.error('Async protest adjudication error:', error);
      }
    }, 0);
  }
  handleNextReady(socket, data) {
    const {
      gameCode
    } = data;
    const gameState = this.activeGames.get(gameCode);
    if (!gameState || !['review', 'review_closed'].includes(gameState.phase)) return;
    const playerInfo = this.playerRooms.get(socket.id);
    if (!playerInfo) return;
    const nextCtx = gameState.nextAdvanceContext;
    if (!nextCtx || nextCtx.roundId !== gameState.roundId) return;
    if (!nextCtx.readyPlayers.includes(playerInfo.playerId)) {
      nextCtx.readyPlayers.push(playerInfo.playerId);
    }
    const expectedReadyPlayers = gameState.players.player2?.isAI ? ['player1'] : ['player1', 'player2'];
    const everyoneReady = expectedReadyPlayers.every(id => nextCtx.readyPlayers.includes(id));
    this.emitNextReadyState(gameCode);
    if (everyoneReady && !nextCtx.isPaused) {
      clearTimeout(gameState.transitionTimer);
      this.advanceQuestion(gameCode, gameState.roundId);
    }
  }
  advanceQuestion(gameCode, expectedRoundId = null) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    if (expectedRoundId !== null && gameState.roundId !== expectedRoundId) return;
    const pendingCtx = gameState.protestAdjustContext;
    if (pendingCtx && pendingCtx.roundId === gameState.roundId && ['selecting', 'awaiting_response', 'pending_ai'].includes(String(pendingCtx.phase || ''))) {
      this.resolveProtestAdjustmentAsync(gameCode, gameState.roundId).catch(error => {
        console.error('resolveProtestAdjustmentAsync (advanceQuestion) error:', error);
      });
    }
    gameState.protestContext = null;
    gameState.nextAdvanceContext = null;
    gameState.protestAdjustContext = null;
    if (gameState.suddenDeath) {
      const player1 = Number(gameState.players.player1?.score || 0);
      const player2 = Number(gameState.players.player2?.score || 0);
      if (player1 !== player2) {
        this.endGame(gameCode);
        return;
      }
    }
    this.nextQuestion(gameCode).catch(error => {
      console.error('nextQuestion transition error:', error);
    });
  }
  closeQuestionAndAdvance(gameCode, expectedRoundId = null, protestResolution = null) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    if (expectedRoundId !== null && gameState.roundId !== expectedRoundId) return;
    if (gameState.phase === 'review_closed') return;
    gameState.phase = 'review_closed';
    clearTimeout(gameState.protestTimer);
    clearTimeout(gameState.protestVoteTimer);
    clearTimeout(gameState.transitionTimer);
    const nextCountdownMs = 15000;
    const nextAdvanceAt = Date.now() + nextCountdownMs;
    const protestWindowEndsAt = Date.now() + 3000;
    const allowProtestAdjust = true;
    const readyPlayers = [];
    if (gameState.players.player2?.isAI) {
      readyPlayers.push('player2');
    }
    gameState.nextAdvanceContext = {
      roundId: gameState.roundId,
      readyPlayers,
      nextAdvanceAt,
      remainingMs: nextCountdownMs,
      isPaused: false,
      protestStatusMessage: null
    };
    gameState.protestAdjustContext = allowProtestAdjust ? {
      roundId: gameState.roundId,
      cycleNumber: gameState.currentCycle,
      phase: 'window',
      pointValue: Number(gameState.currentPointValue || 4),
      allowedPairs: PROTEST_ALLOWED_DELTA_PAIRS,
      allowedDeltas: Array.from(new Set(PROTEST_ALLOWED_DELTA_PAIRS.flatMap(pair => [pair.myDelta, pair.opponentDelta]))),
      windowEndsAt: protestWindowEndsAt,
      selectionEndsAt: null,
      responseEndsAt: null,
      selector: null,
      proposer: null,
      awaitingResponder: null,
      proposal: null,
      proposals: [],
      rounds: 0,
      appliedBy: null,
      deltas: null,
      cancelled: false
    } : null;
    clearTimeout(gameState.protestAdjustTimer);
    if (allowProtestAdjust) {
      gameState.protestAdjustTimer = setTimeout(() => {
        const latest = this.activeGames.get(gameCode);
        if (!latest) return;
        const latestCtx = latest.protestAdjustContext;
        if (!latestCtx || latestCtx.roundId !== latest.roundId) return;
        if (latestCtx.phase !== 'window') return;
        latestCtx.phase = 'closed';
        this.io.to(gameCode).emit('game:protestAdjustState', {
          roundId: latestCtx.roundId,
          phase: latestCtx.phase,
          pointValue: latestCtx.pointValue,
          allowedPairs: latestCtx.allowedPairs,
          allowedDeltas: latestCtx.allowedDeltas,
          windowEndsAt: latestCtx.windowEndsAt,
          selectionEndsAt: latestCtx.selectionEndsAt,
          selector: latestCtx.selector,
          appliedBy: latestCtx.appliedBy,
          deltas: latestCtx.deltas
        });
      }, 3000);
    }
    this.io.to(gameCode).emit('game:questionClosed', {
      roundId: gameState.roundId,
      questionNumber: gameState.currentCycle,
      cycleNumber: gameState.currentCycle,
      correctAnswer: gameState.currentQuestionData?.answer || '',
      protestResolution,
      readyPlayers,
      nextAdvanceAt,
      nextCountdown: Math.ceil(nextCountdownMs / 1000),
      nextCountdownPaused: false,
      protestStatusMessage: null,
      protestAdjust: gameState.protestAdjustContext || null,
      score: {
        player1: gameState.players.player1.score,
        player2: gameState.players.player2?.score || 0
      }
    });
    this.emitNextReadyState(gameCode);
    const roundId = gameState.roundId;
    gameState.transitionTimer = setTimeout(() => {
      this.advanceQuestion(gameCode, roundId);
    }, nextCountdownMs);
  }
  emitNextReadyState(gameCode) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    const nextCtx = gameState.nextAdvanceContext;
    if (!nextCtx || nextCtx.roundId !== gameState.roundId) return;
    const secondsLeft = nextCtx.isPaused ? Math.max(0, Math.ceil(Number(nextCtx.remainingMs || 0) / 1000)) : Math.max(0, Math.ceil((Number(nextCtx.nextAdvanceAt || Date.now()) - Date.now()) / 1000));
    const protestStatusMessage = gameState.protestAdjustContext?.statusMessage || nextCtx.protestStatusMessage || null;
    this.io.to(gameCode).emit('game:nextReadyState', {
      roundId: nextCtx.roundId,
      questionNumber: gameState.currentCycle,
      readyPlayers: nextCtx.readyPlayers || [],
      secondsLeft,
      nextAdvanceAt: nextCtx.nextAdvanceAt || null,
      paused: Boolean(nextCtx.isPaused),
      protestStatusMessage
    });
  }
  pauseNextAdvanceCountdown(gameCode, expectedRoundId = null) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    if (expectedRoundId !== null && gameState.roundId !== expectedRoundId) return;
    const nextCtx = gameState.nextAdvanceContext;
    if (!nextCtx || nextCtx.roundId !== gameState.roundId || nextCtx.isPaused) return;
    nextCtx.remainingMs = Math.max(0, Number(nextCtx.nextAdvanceAt || Date.now()) - Date.now());
    nextCtx.nextAdvanceAt = null;
    nextCtx.isPaused = true;
    clearTimeout(gameState.transitionTimer);
  }
  resumeNextAdvanceCountdown(gameCode, expectedRoundId = null) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    if (expectedRoundId !== null && gameState.roundId !== expectedRoundId) return;
    const nextCtx = gameState.nextAdvanceContext;
    if (!nextCtx || nextCtx.roundId !== gameState.roundId) return;
    if (!nextCtx.isPaused) return;
    const remainingMs = Math.max(0, Number(nextCtx.remainingMs || 0));
    nextCtx.isPaused = false;
    nextCtx.nextAdvanceAt = Date.now() + remainingMs;
    nextCtx.protestStatusMessage = gameState.protestAdjustContext?.statusMessage || nextCtx.protestStatusMessage || null;
    const expectedReadyPlayers = gameState.players.player2?.isAI ? ['player1'] : ['player1', 'player2'];
    const everyoneReady = expectedReadyPlayers.every(id => (nextCtx.readyPlayers || []).includes(id));
    this.emitNextReadyState(gameCode);
    if (everyoneReady || remainingMs <= 0) {
      this.advanceQuestion(gameCode, gameState.roundId);
      return;
    }
    clearTimeout(gameState.transitionTimer);
    const roundId = gameState.roundId;
    gameState.transitionTimer = setTimeout(() => {
      this.advanceQuestion(gameCode, roundId);
    }, remainingMs);
  }
  async endGame(gameCode) {
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    this.clearGameTimers(gameState);
    const game = await Game.findOne({
      gameCode
    });
    if (!game) return;
    const completedCycles = Number(gameState.completedCycles || 0);
    const isNoContest = completedCycles <= 0;
    game.status = isNoContest ? 'cancelled' : 'completed';
    game.endTime = new Date();
    game.score.player1 = gameState.players.player1.score;
    game.score.player2 = gameState.players.player2?.score || 0;
    game.determineWinner();
    await game.save();
    let ratingChanges = null;
    if (!isNoContest && game.gameType === 'ranked' && !game.player2?.isAI) {
      ratingChanges = await ratingService.processGameResult(game);
    }
    if (game.player2?.isAI) {
      const user = await User.findById(game.player1.userId);
      if (user) {
        user.stats.aiGamesPlayed += 1;
        if (game.winner === 'player1') {
          user.stats.aiGamesWon += 1;
        }
        await user.save();
      }
    }
    gameState.phase = 'complete';
    this.io.to(gameCode).emit('game:end', {
      winner: game.winner,
      finalScore: game.score,
      ratingChanges,
      gameId: game._id,
      cancelled: isNoContest
    });
    this.activeGames.delete(gameCode);
  }
  async handleLeaveGame(socket, data) {
    const {
      gameCode,
      intentionalForfeit = false
    } = data || {};
    if (!intentionalForfeit) {
      this.handleSoftLeave(socket, gameCode, 'left');
      return;
    }
    const gameState = this.activeGames.get(gameCode);
    if (!gameState) return;
    const playerInfo = this.playerRooms.get(socket.id);
    if (!playerInfo) return;
    socket.leave(gameCode);
    this.playerRooms.delete(socket.id);
    const stillConnectedOnSide = this.hasConnectedPlayer(gameCode, playerInfo.playerId);
    const isTeamGame = Boolean(gameState.isTeamDuel);
    if (isTeamGame && stillConnectedOnSide) {
      this.io.to(gameCode).emit('game:teammateLeft', {
        playerId: playerInfo.playerId,
        username: socket.user?.username || 'A teammate'
      });
      return;
    }
    this.clearGameTimers(gameState);
    const wasInProgress = gameState.phase !== 'waiting' && gameState.phase !== 'complete';
    const game = await Game.findOne({
      gameCode
    });
    if (game) {
      game.status = 'abandoned';
      if (wasInProgress) {
        game.winner = playerInfo.playerId === 'player1' ? 'player2' : 'player1';
      }
      await game.save();
    }
    this.io.to(gameCode).emit('game:playerLeft', {
      playerId: playerInfo.playerId,
      forfeit: wasInProgress
    });
    this.activeGames.delete(gameCode);
  }
  handleDisconnect(socket) {
    const playerInfo = this.playerRooms.get(socket.id);
    if (playerInfo) {
      this.handleSoftLeave(socket, playerInfo.gameCode, 'disconnect');
    }
  }
  handleSoftLeave(socket, gameCode, reason = 'disconnect') {
    const gameState = this.activeGames.get(gameCode);
    const playerInfo = this.playerRooms.get(socket.id);
    if (playerInfo) {
      socket.leave(playerInfo.gameCode);
      this.playerRooms.delete(socket.id);
    } else {
      this.playerRooms.delete(socket.id);
      return;
    }
    if (!gameState) return;
    if (gameState.players?.[playerInfo.playerId]?.socketId === socket.id) {
      gameState.players[playerInfo.playerId].socketId = null;
    }
    const sideStillConnected = this.hasConnectedPlayer(gameCode, playerInfo.playerId);
    this.io.to(gameCode).emit('game:connectionState', {
      playerId: playerInfo.playerId,
      connected: sideStillConnected,
      reason
    });
  }
  clearGameTimers(gameState) {
    if (!gameState) return;
    clearTimeout(gameState.questionTimer);
    clearTimeout(gameState.buzzTimer);
    clearTimeout(gameState.answerTimer);
    clearTimeout(gameState.countdownTimer);
    clearTimeout(gameState.transitionTimer);
    clearTimeout(gameState.protestTimer);
    clearTimeout(gameState.protestVoteTimer);
    clearTimeout(gameState.protestAdjustTimer);
  }
  checkAnswer(userAnswer, questionData) {
    const userNormalized = this.normalizeAnswer(userAnswer);
    const canonicalAnswer = getCanonicalAnswer(questionData.answer) || String(questionData.answer || '');
    const correctNormalized = this.normalizeAnswer(canonicalAnswer);
    if (questionData.format === 'mc') {
      if (userNormalized === correctNormalized) return true;
      const choiceMap = questionData.choices || {};
      const correctLetter = String(canonicalAnswer || '').trim().toUpperCase();
      const correctChoiceText = choiceMap[correctLetter];
      const normalizedChoiceText = correctChoiceText ? this.normalizeAnswer(correctChoiceText) : '';
      if (normalizedChoiceText && userNormalized === normalizedChoiceText) {
        return true;
      }
      if (normalizedChoiceText && userNormalized) {
        if (this.isWithinLevenshteinTolerance(userNormalized, normalizedChoiceText, 0.2)) return true;
      }
      return false;
    }
    if (userNormalized === correctNormalized) {
      return true;
    }
    const userNoArticles = this.removeArticles(userNormalized);
    const correctNoArticles = this.removeArticles(correctNormalized);
    if (userNoArticles === correctNoArticles) {
      return true;
    }
    if (this.numbersMatch(userNormalized, correctNormalized)) {
      return true;
    }
    if (this.isWithinLevenshteinTolerance(userNoArticles, correctNoArticles, 0.2)) {
      return true;
    }
    return false;
  }
  normalizeAnswer(answer) {
    return answer.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
  }
  removeArticles(answer) {
    return answer.replace(/^(a|an|the)\s+/i, '').replace(/\s+(a|an|the)\s+/gi, ' ').trim();
  }
  numbersMatch(str1, str2) {
    const numberWords = {
      'zero': '0',
      'one': '1',
      'two': '2',
      'three': '3',
      'four': '4',
      'five': '5',
      'six': '6',
      'seven': '7',
      'eight': '8',
      'nine': '9',
      'ten': '10',
      'eleven': '11',
      'twelve': '12',
      'thirteen': '13',
      'fourteen': '14',
      'fifteen': '15',
      'sixteen': '16',
      'seventeen': '17',
      'eighteen': '18',
      'nineteen': '19',
      'twenty': '20',
      'thirty': '30',
      'forty': '40',
      'fifty': '50',
      'sixty': '60',
      'seventy': '70',
      'eighty': '80',
      'ninety': '90',
      'hundred': '100',
      'thousand': '1000',
      'million': '1000000',
      'billion': '1000000000',
      'pi': '3.14159',
      'e': '2.71828'
    };
    const toNumber = s => {
      const lower = s.toLowerCase();
      if (numberWords[lower]) return numberWords[lower];
      const parsed = parseFloat(s);
      if (!isNaN(parsed)) return parsed.toString();
      return s;
    };
    return toNumber(str1) === toNumber(str2);
  }
  levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }
    return dp[m][n];
  }
  isWithinLevenshteinTolerance(candidate, reference, ratio = 0.2) {
    if (!candidate || !reference) return false;
    const normalizedRatio = Number(ratio);
    if (!Number.isFinite(normalizedRatio) || normalizedRatio < 0) return false;
    const referenceLength = String(reference).length;
    if (!referenceLength) return false;
    const distance = this.levenshteinDistance(String(candidate), String(reference));
    return distance / referenceLength <= normalizedRatio;
  }
  sanitizeGameState(gameState) {
    const sanitized = {
      ...gameState
    };
    if (sanitized.currentQuestionData) {
      const {
        answer,
        ...rest
      } = sanitized.currentQuestionData;
      sanitized.currentQuestionData = rest;
    }
    return sanitized;
  }
}
module.exports = GameHandler;
