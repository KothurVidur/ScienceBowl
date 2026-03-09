const mongoose = require('mongoose');
const questionResultSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  },
  questionNumber: {
    type: Number,
    required: true
  },
  category: String,
  format: String,
  player1Response: {
    answer: String,
    isCorrect: Boolean,
    responseTime: Number,
    buzzTime: Number,
    didBuzz: {
      type: Boolean,
      default: false
    }
  },
  player2Response: {
    answer: String,
    isCorrect: Boolean,
    responseTime: Number,
    buzzTime: Number,
    didBuzz: {
      type: Boolean,
      default: false
    }
  },
  pointsAwarded: {
    player1: {
      type: Number,
      default: 0
    },
    player2: {
      type: Number,
      default: 0
    }
  },
  protest: {
    protestedBy: [{
      type: String,
      enum: ['player1', 'player2']
    }],
    claims: {
      player1: {
        ownAnswerAccepted: {
          type: Boolean,
          default: false
        },
        opponentAnswerRejected: {
          type: Boolean,
          default: false
        }
      },
      player2: {
        ownAnswerAccepted: {
          type: Boolean,
          default: false
        },
        opponentAnswerRejected: {
          type: Boolean,
          default: false
        }
      }
    },
    votes: {
      player1: {
        type: String,
        enum: ['accept', 'reject', null],
        default: null
      },
      player2: {
        type: String,
        enum: ['accept', 'reject', null],
        default: null
      }
    },
    overrides: {
      player1: {
        type: Boolean,
        default: null
      },
      player2: {
        type: Boolean,
        default: null
      }
    },
    actions: [{
      protester: {
        type: String,
        enum: ['player1', 'player2']
      },
      targetPlayerId: {
        type: String,
        enum: ['player1', 'player2']
      },
      desiredIsCorrect: Boolean,
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    negotiation: {
      state: {
        type: String,
        default: 'none'
      },
      history: [{
        by: {
          type: String,
          enum: ['player1', 'player2']
        },
        kind: {
          type: String,
          enum: ['proposal', 'accept', 'reject', 'counter', 'appeal']
        },
        proposal: {
          player1Delta: Number,
          player2Delta: Number
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }],
      aiDecision: {
        accepted: {
          type: Boolean,
          default: null
        },
        chosenProposal: {
          player1Delta: Number,
          player2Delta: Number
        },
        rationale: String,
        decidedAt: Date
      }
    },
    resolved: {
      type: Boolean,
      default: false
    },
    accepted: {
      type: Boolean,
      default: null
    },
    decidedBy: {
      type: String,
      enum: ['players', 'gemini', 'fallback', null],
      default: null
    },
    rationale: {
      type: String,
      default: ''
    },
    resolvedAt: Date
  },
  startTime: Date,
  endTime: Date
}, {
  _id: false
});
const gameSchema = new mongoose.Schema({
  gameCode: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  gameType: {
    type: String,
    enum: ['ranked', 'ai', 'practice', 'unranked_1v1'],
    required: true,
    default: 'ranked'
  },
  player1: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    username: String,
    ratingBefore: Number,
    ratingAfter: Number,
    ratingChange: Number
  },
  player2: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    username: String,
    isAI: {
      type: Boolean,
      default: false
    },
    aiDifficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', 'expert'],
      default: 'medium'
    },
    ratingBefore: Number,
    ratingAfter: Number,
    ratingChange: Number
  },
  status: {
    type: String,
    enum: ['waiting', 'in_progress', 'completed', 'abandoned', 'cancelled'],
    default: 'waiting',
    index: true
  },
  score: {
    player1: {
      type: Number,
      default: 0
    },
    player2: {
      type: Number,
      default: 0
    }
  },
  winner: {
    type: String,
    enum: ['player1', 'player2', 'tie', null],
    default: null
  },
  questions: [questionResultSchema],
  currentQuestionIndex: {
    type: Number,
    default: 0
  },
  totalQuestions: {
    type: Number,
    default: 10
  },
  totalCycles: {
    type: Number,
    default: 10
  },
  timePerQuestion: {
    type: Number,
    default: 20000
  },
  buzzWindowTime: {
    type: Number,
    default: 10000
  },
  answerTime: {
    type: Number,
    default: 2000
  },
  startTime: Date,
  endTime: Date,
  settings: {
    categoryFilter: [String],
    difficultyFilter: String,
    allowInterrupts: {
      type: Boolean,
      default: true
    },
    teamDuel: {
      type: Boolean,
      default: false
    },
    team1: {
      id: String,
      name: String,
      captain: {
        userId: mongoose.Schema.Types.Mixed,
        username: String
      },
      members: [{
        userId: mongoose.Schema.Types.Mixed,
        username: String,
        joinedAt: Date
      }]
    },
    team2: {
      id: String,
      name: String,
      captain: {
        userId: mongoose.Schema.Types.Mixed,
        username: String
      },
      members: [{
        userId: mongoose.Schema.Types.Mixed,
        username: String,
        joinedAt: Date
      }]
    }
  }
}, {
  timestamps: true
});
gameSchema.index({
  'player1.userId': 1,
  createdAt: -1
});
gameSchema.index({
  'player2.userId': 1,
  createdAt: -1
});
gameSchema.index({
  status: 1,
  gameType: 1
});
gameSchema.index({
  createdAt: -1
});
gameSchema.statics.generateGameCode = function () {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};
gameSchema.virtual('duration').get(function () {
  if (!this.startTime || !this.endTime) return null;
  return this.endTime - this.startTime;
});
gameSchema.virtual('formattedScore').get(function () {
  return `${this.score.player1} - ${this.score.player2}`;
});
gameSchema.methods.calculateRatingChanges = function () {
  if (this.gameType !== 'ranked' || this.player2.isAI) {
    return {
      player1Change: 0,
      player2Change: 0
    };
  }
  const K = 32;
  const player1Rating = this.player1.ratingBefore || 1500;
  const player2Rating = this.player2.ratingBefore || 1500;
  const expected1 = 1 / (1 + Math.pow(10, (player2Rating - player1Rating) / 400));
  const expected2 = 1 / (1 + Math.pow(10, (player1Rating - player2Rating) / 400));
  let actual1, actual2;
  if (this.winner === 'player1') {
    actual1 = 1;
    actual2 = 0;
  } else if (this.winner === 'player2') {
    actual1 = 0;
    actual2 = 1;
  } else {
    actual1 = 0.5;
    actual2 = 0.5;
  }
  return {
    player1Change: Math.round(K * (actual1 - expected1)),
    player2Change: Math.round(K * (actual2 - expected2))
  };
};
gameSchema.methods.determineWinner = function () {
  if (this.score.player1 > this.score.player2) {
    this.winner = 'player1';
  } else if (this.score.player2 > this.score.player1) {
    this.winner = 'player2';
  } else {
    this.winner = 'tie';
  }
  return this.winner;
};
gameSchema.set('toJSON', {
  virtuals: true
});
module.exports = mongoose.model('Game', gameSchema);
