const QUESTION_TYPES = ['TOSSUP', 'BONUS'];
const QUESTION_FORMATS = ['Short Answer', 'Multiple Choice'];
const QUESTION_CATEGORIES = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Earth and Space', 'Energy', 'Other'];
const CATEGORY_ALIASES = {
  mathematics: 'Mathematics',
  math: 'Mathematics',
  physics: 'Physics',
  chemistry: 'Chemistry',
  biology: 'Biology',
  earthandspace: 'Earth and Space',
  earthspace: 'Earth and Space',
  'earth and space': 'Earth and Space',
  earthscience: 'Earth and Space',
  energy: 'Energy',
  other: 'Other',
  misc: 'Other',
  miscellaneous: 'Other',
  unknown: 'Other'
};
const DEFAULT_DIFFICULTY = 0.5;
const clampDifficulty = value => {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_DIFFICULTY;
  return Math.max(0, Math.min(1, num));
};
const normalizeType = value => {
  const text = String(value || '').trim().toUpperCase();
  if (text === 'TOSSUP' || text === 'TOSS-UP') return 'TOSSUP';
  if (text === 'BONUS') return 'BONUS';
  throw new Error(`Invalid question type: ${value}`);
};
const normalizeFormat = value => {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'short answer' || text === 'shortanswer' || text === 'sa') return 'Short Answer';
  if (text === 'multiple choice' || text === 'multiplechoice' || text === 'multiple_choice' || text === 'mc') {
    return 'Multiple Choice';
  }
  throw new Error(`Invalid question format: ${value}`);
};
const normalizeCategory = value => {
  const text = String(value || '').trim();
  if (QUESTION_CATEGORIES.includes(text)) return text;
  const normalizedKey = text.toLowerCase().replace(/[_\-]/g, '').replace(/\s+/g, ' ').trim();
  const squashed = normalizedKey.replace(/\s+/g, '');
  const mapped = CATEGORY_ALIASES[normalizedKey] || CATEGORY_ALIASES[squashed];
  if (!mapped) throw new Error(`Invalid question category: ${value}`);
  return mapped;
};
const normalizeDifficulty = value => {
  if (value === undefined || value === null || value === '') return DEFAULT_DIFFICULTY;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'easy') return 0.2;
    if (lower === 'medium') return 0.5;
    if (lower === 'hard') return 0.8;
  }
  return clampDifficulty(value);
};
const difficultyBand = value => {
  const v = normalizeDifficulty(value);
  if (v < 0.33) return 'easy';
  if (v < 0.66) return 'medium';
  return 'hard';
};
const difficultyFilterFromInput = input => {
  if (input === undefined || input === null || input === '') return null;
  const values = String(input).split(',').map(v => v.trim()).filter(Boolean);
  if (!values.length) return null;
  const clauses = [];
  values.forEach(value => {
    const lower = value.toLowerCase();
    if (lower === 'easy') {
      clauses.push({
        difficulty: {
          $gte: 0,
          $lt: 0.33
        }
      });
      return;
    }
    if (lower === 'medium') {
      clauses.push({
        difficulty: {
          $gte: 0.33,
          $lt: 0.66
        }
      });
      return;
    }
    if (lower === 'hard') {
      clauses.push({
        difficulty: {
          $gte: 0.66,
          $lte: 1
        }
      });
      return;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      clauses.push({
        difficulty: clampDifficulty(numeric)
      });
    }
  });
  if (!clauses.length) return null;
  if (clauses.length === 1) return clauses[0];
  return {
    $or: clauses
  };
};
const getCanonicalAnswer = answer => {
  if (!answer) return '';
  if (typeof answer === 'string') return answer.trim();
  if (typeof answer !== 'object') return '';
  return String(answer.canonical || '').trim();
};
const getAlternateAnswers = answer => {
  if (!answer || typeof answer !== 'object' || !Array.isArray(answer.alternates)) return [];
  return answer.alternates.map(alt => String(alt || '').trim()).filter(Boolean);
};
const toRuntimeType = value => normalizeType(value) === 'BONUS' ? 'bonus' : 'tossup';
const toRuntimeFormat = value => normalizeFormat(value) === 'Multiple Choice' ? 'mc' : 'sa';
const toStatsCategoryKey = value => {
  const canonical = normalizeCategory(value);
  if (canonical === 'Mathematics') return 'mathematics';
  if (canonical === 'Earth and Space') return 'earthAndSpace';
  if (canonical === 'Biology') return 'biology';
  if (canonical === 'Chemistry') return 'chemistry';
  if (canonical === 'Physics') return 'physics';
  if (canonical === 'Energy') return 'energy';
  if (canonical === 'Other') return 'other';
  return 'uncategorized';
};
const normalizeChoices = choices => {
  if (!choices || typeof choices !== 'object') return undefined;
  const letters = ['W', 'X', 'Y', 'Z'];
  const normalized = {};
  letters.forEach(letter => {
    const value = String(choices[letter] || '').trim();
    if (value) normalized[letter] = value;
  });
  return Object.keys(normalized).length ? normalized : undefined;
};
const normalizeQuestionPayload = (input = {}) => {
  const questionText = String(input.questionText || input.question || '').trim();
  const canonicalAnswer = getCanonicalAnswer(input.answer);
  const alternates = Array.isArray(input?.answer?.alternates) ? input.answer.alternates : [];
  return {
    type: normalizeType(input.type),
    format: normalizeFormat(input.format),
    category: normalizeCategory(input.category),
    difficulty: normalizeDifficulty(input.difficulty),
    questionText,
    choices: normalizeChoices(input.choices),
    answer: {
      canonical: canonicalAnswer,
      alternates: alternates.map(alt => String(alt || '').trim()).filter(Boolean)
    },
    explanation: String(input.explanation || '').trim(),
    tags: Array.isArray(input.tags) ? input.tags.map(tag => String(tag || '').trim()).filter(Boolean) : [],
    source: {
      packet: String(input.source?.packet || '').trim(),
      round: String(input.source?.round || '').trim(),
      question: String(input.source?.question || '').trim()
    },
    relatedTossup: input.relatedTossup || null,
    isActive: input.isActive !== false
  };
};
module.exports = {
  QUESTION_TYPES,
  QUESTION_FORMATS,
  QUESTION_CATEGORIES,
  normalizeType,
  normalizeFormat,
  normalizeCategory,
  normalizeDifficulty,
  difficultyBand,
  difficultyFilterFromInput,
  getCanonicalAnswer,
  getAlternateAnswers,
  toRuntimeType,
  toRuntimeFormat,
  toStatsCategoryKey,
  normalizeQuestionPayload
};
