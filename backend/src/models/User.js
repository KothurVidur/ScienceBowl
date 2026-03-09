const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [20, 'Username cannot exceed 20 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  displayName: {
    type: String,
    trim: true,
    maxlength: [50, 'Display name cannot exceed 50 characters']
  },
  avatar: {
    type: String,
    default: 'default'
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: ''
  },
  rating: {
    type: Number,
    default: 1500,
    min: 0
  },
  peakRating: {
    type: Number,
    default: 1500
  },
  ratingHistory: [{
    rating: Number,
    date: {
      type: Date,
      default: Date.now
    },
    change: Number
  }],
  stats: {
    gamesPlayed: {
      type: Number,
      default: 0
    },
    gamesWon: {
      type: Number,
      default: 0
    },
    gamesLost: {
      type: Number,
      default: 0
    },
    gamesTied: {
      type: Number,
      default: 0
    },
    questionsAnswered: {
      type: Number,
      default: 0
    },
    questionsCorrect: {
      type: Number,
      default: 0
    },
    categoryStats: {
      biology: {
        answered: {
          type: Number,
          default: 0
        },
        correct: {
          type: Number,
          default: 0
        }
      },
      chemistry: {
        answered: {
          type: Number,
          default: 0
        },
        correct: {
          type: Number,
          default: 0
        }
      },
      physics: {
        answered: {
          type: Number,
          default: 0
        },
        correct: {
          type: Number,
          default: 0
        }
      },
      mathematics: {
        answered: {
          type: Number,
          default: 0
        },
        correct: {
          type: Number,
          default: 0
        }
      },
      earthAndSpace: {
        answered: {
          type: Number,
          default: 0
        },
        correct: {
          type: Number,
          default: 0
        }
      },
      energy: {
        answered: {
          type: Number,
          default: 0
        },
        correct: {
          type: Number,
          default: 0
        }
      },
      other: {
        answered: {
          type: Number,
          default: 0
        },
        correct: {
          type: Number,
          default: 0
        }
      },
      uncategorized: {
        answered: {
          type: Number,
          default: 0
        },
        correct: {
          type: Number,
          default: 0
        }
      }
    },
    currentWinStreak: {
      type: Number,
      default: 0
    },
    longestWinStreak: {
      type: Number,
      default: 0
    },
    averageResponseTime: {
      type: Number,
      default: 0
    },
    fastestCorrectAnswer: {
      type: Number,
      default: null
    },
    aiGamesPlayed: {
      type: Number,
      default: 0
    },
    aiGamesWon: {
      type: Number,
      default: 0
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  passwordResetToken: {
    type: String,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    select: false
  },
  preferences: {
    soundEnabled: {
      type: Boolean,
      default: true
    },
    animationsEnabled: {
      type: Boolean,
      default: true
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    }
  }
}, {
  timestamps: true
});
userSchema.index({
  rating: -1
});
userSchema.index({
  'stats.gamesPlayed': -1
});
userSchema.index({
  username: 'text',
  displayName: 'text'
});
userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }
  if (this.rating > this.peakRating) {
    this.peakRating = this.rating;
  }
  next();
});
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};
userSchema.methods.generateAuthToken = function () {
  return jwt.sign({
    id: this._id,
    username: this.username
  }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};
userSchema.methods.getPublicProfile = function () {
  return {
    id: this._id,
    username: this.username,
    displayName: this.displayName || this.username,
    avatar: this.avatar,
    bio: this.bio,
    rating: this.rating,
    peakRating: this.peakRating,
    stats: this.stats,
    createdAt: this.createdAt,
    lastActive: this.lastActive
  };
};
userSchema.virtual('winRate').get(function () {
  if (this.stats.gamesPlayed === 0) return 0;
  return (this.stats.gamesWon / this.stats.gamesPlayed * 100).toFixed(1);
});
userSchema.virtual('accuracy').get(function () {
  if (this.stats.questionsAnswered === 0) return 0;
  return (this.stats.questionsCorrect / this.stats.questionsAnswered * 100).toFixed(1);
});
userSchema.virtual('rankTitle').get(function () {
  if (this.rating >= 2400) return 'Grandmaster';
  if (this.rating >= 2200) return 'Master';
  if (this.rating >= 2000) return 'Expert';
  if (this.rating >= 1800) return 'Class A';
  if (this.rating >= 1600) return 'Class B';
  if (this.rating >= 1400) return 'Class C';
  if (this.rating >= 1200) return 'Class D';
  return 'Beginner';
});
userSchema.set('toJSON', {
  virtuals: true
});
userSchema.set('toObject', {
  virtuals: true
});
module.exports = mongoose.model('User', userSchema);
