const User = require('../models/User');
const { toStatsCategoryKey } = require('../utils/questionSchema');

class RatingService {
  constructor() {
    this.BASE_K = 32;
    this.K_FACTORS = {
      provisional: 40,
      established: 32,
      veteran: 24
    };
    this.DEFAULT_RATING = 1500;
    this.RATING_FLOOR = 100;
  }

  getKFactor(gamesPlayed) {
    if (gamesPlayed < 30) return this.K_FACTORS.provisional;
    if (gamesPlayed < 100) return this.K_FACTORS.established;
    return this.K_FACTORS.veteran;
  }

  getActivityMultiplier(player) {
    const gamesPlayed = player?.stats?.gamesPlayed ?? 0;
    const now = Date.now();
    const lastActiveMs = player?.lastActive ? new Date(player.lastActive).getTime() : now;
    const inactiveDays = Math.max(0, (now - lastActiveMs) / (1000 * 60 * 60 * 24));

    let multiplier = 1;

    if (gamesPlayed < 15) multiplier += 0.25;
    else if (gamesPlayed < 40) multiplier += 0.1;

    if (inactiveDays >= 180) multiplier += 0.25;
    else if (inactiveDays >= 60) multiplier += 0.15;
    else if (inactiveDays >= 30) multiplier += 0.08;

    if (gamesPlayed >= 150 && inactiveDays < 14) multiplier -= 0.12;
    else if (gamesPlayed >= 80 && inactiveDays < 14) multiplier -= 0.06;

    return Math.min(1.6, Math.max(0.82, multiplier));
  }

  getMarginMultiplier(scoreDiff) {
    const diff = Math.max(0, Number(scoreDiff) || 0);
    if (diff <= 0) return 1;
    if (diff <= 4) return 1.03;
    if (diff <= 8) return 1.08;
    if (diff <= 16) return 1.15;
    if (diff <= 24) return 1.22;
    if (diff <= 32) return 1.3;
    return 1.38;
  }

  calculateExpectedScore(playerRating, opponentRating) {
    return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  }

  calculateRatingChange(playerRating, opponentRating, actualScore, kFactor) {
    const expectedScore = this.calculateExpectedScore(playerRating, opponentRating);
    return Math.round(kFactor * (actualScore - expectedScore));
  }

  async processGameResult(game) {
    if (game.gameType !== 'ranked') {
      return { player1Change: 0, player2Change: 0 };
    }

    const player1 = await User.findById(game.player1.userId);
    const player2 = game.player2.isAI ? null : await User.findById(game.player2.userId);

    if (!player1 || (!player2 && !game.player2.isAI)) {
      throw new Error('Players not found');
    }

    const player1Rating = player1.rating;
    const player2Rating = player2 ? player2.rating : this.DEFAULT_RATING;

    let player1Score, player2Score;
    if (game.winner === 'player1') {
      player1Score = 1; player2Score = 0;
    } else if (game.winner === 'player2') {
      player1Score = 0; player2Score = 1;
    } else {
      player1Score = 0.5; player2Score = 0.5;
    }
    const isTie = player1Score === 0.5 && player2Score === 0.5;

    const player1BaseK = this.getKFactor(player1.stats.gamesPlayed);
    const player2BaseK = player2 ? this.getKFactor(player2.stats.gamesPlayed) : this.BASE_K;

    const scoreDiff = Math.abs((game.score?.player1 || 0) - (game.score?.player2 || 0));
    const marginMultiplier = this.getMarginMultiplier(scoreDiff);
    const player1ActivityMultiplier = this.getActivityMultiplier(player1);
    const player2ActivityMultiplier = player2 ? this.getActivityMultiplier(player2) : 1;

    const player1K = Math.round(player1BaseK * player1ActivityMultiplier * marginMultiplier);
    const player2K = player2
      ? Math.round(player2BaseK * player2ActivityMultiplier * marginMultiplier)
      : this.BASE_K;

    const player1Change = isTie
      ? 0
      : this.calculateRatingChange(player1Rating, player2Rating, player1Score, player1K);
    const player2Change = player2
      ? (isTie ? 0 : this.calculateRatingChange(player2Rating, player1Rating, player2Score, player2K))
      : 0;

    player1.rating = Math.max(this.RATING_FLOOR, player1Rating + player1Change);
    player1.ratingHistory.push({ rating: player1.rating, change: player1Change, date: new Date() });
    if (player1.ratingHistory.length > 100) {
      player1.ratingHistory = player1.ratingHistory.slice(-100);
    }

    player1.stats.gamesPlayed += 1;
    if (game.winner === 'player1') {
      player1.stats.gamesWon += 1;
      player1.stats.currentWinStreak += 1;
      if (player1.stats.currentWinStreak > player1.stats.longestWinStreak) {
        player1.stats.longestWinStreak = player1.stats.currentWinStreak;
      }
    } else if (game.winner === 'player2') {
      player1.stats.gamesLost += 1;
      player1.stats.currentWinStreak = 0;
    } else {
      player1.stats.gamesTied += 1;
    }

    await player1.save();

    if (player2) {
      player2.rating = Math.max(this.RATING_FLOOR, player2Rating + player2Change);
      player2.ratingHistory.push({ rating: player2.rating, change: player2Change, date: new Date() });
      if (player2.ratingHistory.length > 100) {
        player2.ratingHistory = player2.ratingHistory.slice(-100);
      }

      player2.stats.gamesPlayed += 1;
      if (game.winner === 'player2') {
        player2.stats.gamesWon += 1;
        player2.stats.currentWinStreak += 1;
        if (player2.stats.currentWinStreak > player2.stats.longestWinStreak) {
          player2.stats.longestWinStreak = player2.stats.currentWinStreak;
        }
      } else if (game.winner === 'player1') {
        player2.stats.gamesLost += 1;
        player2.stats.currentWinStreak = 0;
      } else {
        player2.stats.gamesTied += 1;
      }

      await player2.save();
    }

    game.player1.ratingAfter = player1.rating;
    game.player1.ratingChange = player1Change;
    if (player2) {
      game.player2.ratingAfter = player2.rating;
      game.player2.ratingChange = player2Change;
    }
    await game.save();

    return {
      player1Change,
      player2Change,
      player1NewRating: player1.rating,
      player2NewRating: player2 ? player2.rating : null
    };
  }

  async updatePlayerQuestionStats(userId, category, isCorrect, responseTime) {
    const user = await User.findById(userId);
    if (!user) return;

    user.stats.questionsAnswered += 1;
    if (isCorrect) {
      user.stats.questionsCorrect += 1;
    }

    const catKey = toStatsCategoryKey(category);
    if (catKey === 'other' && !user.stats.categoryStats.other) {
      user.stats.categoryStats.other = { answered: 0, correct: 0 };
    }
    if (user.stats.categoryStats[catKey]) {
      user.stats.categoryStats[catKey].answered += 1;
      if (isCorrect) {
        user.stats.categoryStats[catKey].correct += 1;
      }
    }

    const totalTime = user.stats.averageResponseTime * (user.stats.questionsAnswered - 1) + responseTime;
    user.stats.averageResponseTime = Math.round(totalTime / user.stats.questionsAnswered);

    if (isCorrect) {
      if (!user.stats.fastestCorrectAnswer || responseTime < user.stats.fastestCorrectAnswer) {
        user.stats.fastestCorrectAnswer = responseTime;
      }
    }

    await user.save();
  }
}

module.exports = new RatingService();
