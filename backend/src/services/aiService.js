const {
  normalizeCategory,
  toRuntimeFormat,
  getCanonicalAnswer,
  difficultyBand
} = require('../utils/questionSchema');
class AIService {
  constructor() {
    this.difficulties = {
      easy: {
        correctProbability: 0.25,
        buzzDelayMin: 5000,
        buzzDelayMax: 8000,
        buzzProbability: 0.35,
        answerTimeMin: 2000,
        answerTimeMax: 4000
      },
      medium: {
        correctProbability: 0.5,
        buzzDelayMin: 3500,
        buzzDelayMax: 6500,
        buzzProbability: 0.55,
        answerTimeMin: 1500,
        answerTimeMax: 3500
      },
      hard: {
        correctProbability: 0.7,
        buzzDelayMin: 2000,
        buzzDelayMax: 5000,
        buzzProbability: 0.75,
        answerTimeMin: 1000,
        answerTimeMax: 2500
      },
      expert: {
        correctProbability: 0.9,
        buzzDelayMin: 1000,
        buzzDelayMax: 3000,
        buzzProbability: 0.9,
        answerTimeMin: 800,
        answerTimeMax: 2000
      }
    };
  }
  getSettings(difficulty) {
    return this.difficulties[difficulty] || this.difficulties.medium;
  }
  willBuzz(difficulty) {
    const settings = this.getSettings(difficulty);
    return Math.random() < settings.buzzProbability;
  }
  getBuzzTime(difficulty) {
    const settings = this.getSettings(difficulty);
    return this.randomInRange(settings.buzzDelayMin, settings.buzzDelayMax);
  }
  getAnswerTime(difficulty) {
    const settings = this.getSettings(difficulty);
    return this.randomInRange(settings.answerTimeMin, settings.answerTimeMax);
  }
  willAnswerCorrectly(difficulty, questionDifficulty) {
    const settings = this.getSettings(difficulty);
    let probability = settings.correctProbability;
    const difficultyLabel = difficultyBand(questionDifficulty);
    if (difficultyLabel === 'hard') {
      probability *= 0.8;
    } else if (difficultyLabel === 'easy') {
      probability *= 1.1;
    }
    return Math.random() < Math.min(probability, 1);
  }
  generateMCAnswer(question, isCorrect) {
    const canonicalAnswer = getCanonicalAnswer(question.answer);
    if (isCorrect) {
      return canonicalAnswer;
    }
    const choices = ['W', 'X', 'Y', 'Z'].filter(c => c !== canonicalAnswer);
    return choices[Math.floor(Math.random() * choices.length)];
  }
  generateSAAnswer(question, isCorrect) {
    const canonicalAnswer = getCanonicalAnswer(question.answer);
    if (isCorrect) {
      return canonicalAnswer;
    }
    const wrongAnswers = this.getPlausibleWrongAnswers(question);
    return wrongAnswers[Math.floor(Math.random() * wrongAnswers.length)];
  }
  getPlausibleWrongAnswers(question) {
    const categoryKey = normalizeCategory(question.category);
    const wrongAnswersByCategory = {
      Biology: ['mitochondria', 'nucleus', 'ribosome', 'chloroplast', 'DNA', 'RNA', 'protein', 'enzyme'],
      Chemistry: ['oxygen', 'hydrogen', 'carbon', 'nitrogen', 'sodium', 'chlorine', 'electron', 'proton'],
      Physics: ['gravity', 'velocity', 'acceleration', 'force', 'energy', 'momentum', 'wave', 'photon'],
      Mathematics: ['pi', 'infinity', 'zero', 'one', 'two', 'prime', 'integer', 'rational'],
      'Earth and Space': ['granite', 'basalt', 'limestone', 'sediment', 'magma', 'tectonic', 'erosion', 'weathering'],
      Energy: ['solar', 'nuclear', 'kinetic', 'potential', 'thermal', 'electrical', 'chemical', 'fusion'],
      Other: ['matter', 'system', 'process', 'constant', 'measurement', 'mechanism', 'theory', 'model']
    };
    return wrongAnswersByCategory[categoryKey] || ['unknown'];
  }
  simulateAITurn(question, difficulty) {
    const settings = this.getSettings(difficulty);
    const willBuzz = this.willBuzz(difficulty);
    if (!willBuzz) {
      return {
        didBuzz: false,
        answer: null,
        isCorrect: false,
        buzzTime: null,
        answerTime: null
      };
    }
    const buzzTime = this.getBuzzTime(difficulty);
    const answerTime = this.getAnswerTime(difficulty);
    const willBeCorrect = this.willAnswerCorrectly(difficulty, question.difficulty);
    let answer;
    if (toRuntimeFormat(question.format) === 'mc') {
      answer = this.generateMCAnswer(question, willBeCorrect);
    } else {
      answer = this.generateSAAnswer(question, willBeCorrect);
    }
    return {
      didBuzz: true,
      answer,
      isCorrect: willBeCorrect,
      buzzTime,
      answerTime,
      totalResponseTime: buzzTime + answerTime
    };
  }
  randomInRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  getAIDisplayName(difficulty) {
    const names = {
      easy: 'Nova (Beginner AI)',
      medium: 'Cosmos (Intermediate AI)',
      hard: 'Quantum (Advanced AI)',
      expert: 'Einstein (Expert AI)'
    };
    return names[difficulty] || names.medium;
  }
  getAIAvatar(difficulty) {
    const avatars = {
      easy: 'ai-easy',
      medium: 'ai-medium',
      hard: 'ai-hard',
      expert: 'ai-expert'
    };
    return avatars[difficulty] || avatars.medium;
  }
}
module.exports = new AIService();
