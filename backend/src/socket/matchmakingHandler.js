const Game = require('../models/Game');
const Question = require('../models/Question');
const { toRuntimeFormat } = require('../utils/questionSchema');

const hasUniqueQuestionIds = (questions = []) => {
  const ids = questions.map((q) => String(q?._id || '')).filter(Boolean);
  return ids.length > 0 && new Set(ids).size === ids.length;
};

/**
 * Matchmaking Handler
 * 1v1 queues only: ranked_1v1, unranked_1v1
 */
class MatchmakingHandler {
  constructor(io) {
    this.io = io;
    this.queue = [];
    this.searchIntervals = new Map();
    this.isCreatingMatch = false;
  }

  initialize(socket) {
    socket.on('matchmaking:join', (data = {}) => this.handleJoinQueue(socket, data));
    socket.on('matchmaking:leave', () => this.handleLeaveQueue(socket));
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  async handleJoinQueue(socket, data = {}) {
    try {
      const queueType = this.normalizeQueueType(data.queueType);

      if (this.queue.find((p) => p.socketId === socket.id)) {
        socket.emit('matchmaking:error', { message: 'Already in queue' });
        return;
      }

      if (this.queue.find((p) => p.userId === socket.user._id.toString())) {
        socket.emit('matchmaking:error', { message: 'Already in queue from another session' });
        return;
      }

      const player = {
        socketId: socket.id,
        userId: socket.user._id.toString(),
        username: socket.user.username,
        rating: socket.user.rating,
        queueType,
        joinedAt: Date.now()
      };

      this.queue.push(player);
      const queuePosition = this.queue.filter((p) => p.queueType === queueType).length;

      socket.emit('matchmaking:joined', {
        queueType,
        position: queuePosition,
        estimatedWait: this.estimateWaitTime()
      });

      this.io.emit('matchmaking:stats', this.getQueueStats());
      this.tryImmediateMatch();

      const interval = setInterval(() => {
        this.tryImmediateMatch();
      }, 5000);
      this.searchIntervals.set(socket.id, interval);
    } catch (error) {
      console.error('Join queue error:', error);
      socket.emit('matchmaking:error', { message: 'Failed to join queue' });
    }
  }

  async tryImmediateMatch() {
    if (this.isCreatingMatch) return;
    if (this.queue.length < 2) return;

    this.isCreatingMatch = true;
    try {
      this.queue.sort((a, b) => a.joinedAt - b.joinedAt);
      const player1 = this.queue[0];
      if (!player1) return;

      const player2 = this.queue.find((p, idx) => {
        if (idx === 0) return false;
        return p.queueType === player1.queueType;
      });
      if (!player2) return;

      await this.createMatch(player1, player2);
    } finally {
      this.isCreatingMatch = false;
    }
  }

  async createMatch(player1, player2) {
    try {
      this.queue = this.queue.filter((p) => p.socketId !== player1.socketId && p.socketId !== player2.socketId);

      clearInterval(this.searchIntervals.get(player1.socketId));
      clearInterval(this.searchIntervals.get(player2.socketId));
      this.searchIntervals.delete(player1.socketId);
      this.searchIntervals.delete(player2.socketId);

      let gameCode;
      let attempts = 0;
      do {
        gameCode = Game.generateGameCode();
        // eslint-disable-next-line no-await-in-loop
        const existing = await Game.findOne({ gameCode, status: { $in: ['waiting', 'in_progress'] } });
        if (!existing) break;
        attempts += 1;
      } while (attempts < 10);

      const queueType = player1.queueType || 'ranked_1v1';
      const mappedGameType = this.mapQueueTypeToGameType(queueType);
      const cycleCount = 10;
      const questionCount = cycleCount * 2;
      const difficultyRange = { min: 0, max: 1 };

      let questions = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        const candidateQuestions = await Question.getTossupBonusCycles(cycleCount, {
          difficultyMin: difficultyRange.min,
          difficultyMax: difficultyRange.max
        });
        if (Array.isArray(candidateQuestions) &&
          candidateQuestions.length >= questionCount &&
          hasUniqueQuestionIds(candidateQuestions)) {
          questions = candidateQuestions;
          break;
        }
      }

      if (!Array.isArray(questions) || questions.length < questionCount || !hasUniqueQuestionIds(questions)) {
        throw new Error(
          `Insufficient tossup/bonus pool in range [${difficultyRange.min}, ${difficultyRange.max}]: ` +
          `need ${questionCount} unique, got ${questions?.length || 0}`
        );
      }

      const game = await Game.create({
        gameCode,
        gameType: mappedGameType,
        status: 'in_progress',
        startTime: new Date(),
        player1: {
          userId: player1.userId,
          username: player1.username,
          ratingBefore: player1.rating
        },
        player2: {
          userId: player2.userId,
          username: player2.username,
          ratingBefore: player2.rating,
          isAI: false
        },
        questions: questions.map((q, index) => ({
          questionId: q._id,
          questionNumber: index + 1,
          category: q.category,
          format: toRuntimeFormat(q.format)
        })),
        totalQuestions: questionCount,
        totalCycles: cycleCount,
        settings: {
          difficultyFilter: `${difficultyRange.min}-${difficultyRange.max}`
        }
      });

      const matchData = {
        gameCode,
        gameId: game._id,
        queueType,
        gameType: mappedGameType
      };

      const socket1 = this.io.sockets.sockets.get(player1.socketId);
      if (socket1) {
        socket1.emit('matchmaking:matched', {
          ...matchData,
          opponent: {
            username: player2.username,
            rating: player2.rating
          },
          yourPosition: 'player1'
        });
      }

      const socket2 = this.io.sockets.sockets.get(player2.socketId);
      if (socket2) {
        socket2.emit('matchmaking:matched', {
          ...matchData,
          opponent: {
            username: player1.username,
            rating: player1.rating
          },
          yourPosition: 'player2'
        });
      }

      this.io.emit('matchmaking:stats', this.getQueueStats());
    } catch (error) {
      console.error('Create match error:', error);
      const socket1 = this.io.sockets.sockets.get(player1?.socketId);
      const socket2 = this.io.sockets.sockets.get(player2?.socketId);
      const message = 'Match failed to start: not enough tossup/bonus questions configured.';
      if (socket1) socket1.emit('matchmaking:error', { message });
      if (socket2) socket2.emit('matchmaking:error', { message });
    }
  }

  handleLeaveQueue(socket) {
    this.queue = this.queue.filter((p) => p.socketId !== socket.id);

    clearInterval(this.searchIntervals.get(socket.id));
    this.searchIntervals.delete(socket.id);

    socket.emit('matchmaking:left');
    this.io.emit('matchmaking:stats', this.getQueueStats());
  }

  handleDisconnect(socket) {
    this.handleLeaveQueue(socket);
  }

  estimateWaitTime() {
    if (this.queue.length <= 1) return 1;
    return 0;
  }

  normalizeQueueType(queueType) {
    const allowed = ['ranked_1v1', 'unranked_1v1'];
    return allowed.includes(queueType) ? queueType : 'ranked_1v1';
  }

  mapQueueTypeToGameType(queueType) {
    if (queueType === 'unranked_1v1') return 'unranked_1v1';
    return 'ranked';
  }

  getQueueStats() {
    const rankedCount = this.queue.filter((p) => p.queueType === 'ranked_1v1').length;
    const unrankedCount = this.queue.filter((p) => p.queueType === 'unranked_1v1').length;

    return {
      playersInQueue: this.queue.length,
      byQueue: {
        ranked_1v1: rankedCount,
        unranked_1v1: unrankedCount
      },
      averageRating: this.queue.length > 0
        ? Math.round(this.queue.reduce((sum, p) => sum + p.rating, 0) / this.queue.length)
        : 0
    };
  }
}

module.exports = MatchmakingHandler;
