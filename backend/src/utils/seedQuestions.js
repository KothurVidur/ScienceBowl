#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const Question = require('../models/Question');
const {
  normalizeQuestionPayload
} = require('./questionSchema');
const DEFAULT_INPUT_PATH = path.join(__dirname, '../questions/sample.json');
const printUsage = () => {
  console.log('Usage: node src/utils/seedQuestions.js [input-json-path] [--append]');
  console.log('  input-json-path: optional, defaults to src/questions/sample.json');
  console.log('  --append: keep existing questions (default behavior is replace)');
};
const loadQuestionArray = async filePath => {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Input JSON must be an array of question objects.');
  }
  if (!parsed.length) {
    throw new Error('Input JSON array is empty.');
  }
  return parsed;
};
async function seedQuestions() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }
  const inputArg = args.find(arg => !arg.startsWith('--'));
  const inputPath = inputArg ? path.resolve(inputArg) : DEFAULT_INPUT_PATH;
  const appendMode = args.includes('--append');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sciencebowl';
  const rawQuestions = await loadQuestionArray(inputPath);
  const normalized = rawQuestions.map((q, index) => {
    try {
      const normalizedQuestion = normalizeQuestionPayload(q);
      if (!normalizedQuestion.questionText) {
        throw new Error('questionText is required');
      }
      if (!normalizedQuestion.answer?.canonical) {
        throw new Error('answer.canonical is required');
      }
      return normalizedQuestion;
    } catch (error) {
      throw new Error(`Question #${index + 1} invalid: ${error.message}`);
    }
  });
  const tossups = normalized.filter(q => q.type === 'TOSSUP');
  const bonuses = normalized.filter(q => q.type === 'BONUS');
  if (!tossups.length || !bonuses.length) {
    throw new Error('Question set must include at least one TOSSUP and one BONUS.');
  }
  await mongoose.connect(mongoUri);
  try {
    if (!appendMode) {
      await Question.deleteMany({});
      console.log('Cleared existing questions.');
    }
    const tossupDocs = tossups.map(q => ({
      ...q,
      _id: new mongoose.Types.ObjectId()
    }));
    const tossupsByCategory = tossupDocs.reduce((acc, q) => {
      if (!acc[q.category]) acc[q.category] = [];
      acc[q.category].push(q);
      return acc;
    }, {});
    const bonusDocs = bonuses.map((bonus, index) => {
      const pool = tossupsByCategory[bonus.category] || tossupDocs;
      const linkedTossup = pool[index % pool.length];
      return {
        ...bonus,
        relatedTossup: bonus.relatedTossup || linkedTossup?._id || null
      };
    });
    const inserted = await Question.insertMany([...tossupDocs, ...bonusDocs], {
      ordered: false
    });
    const byType = inserted.reduce((acc, q) => {
      acc[q.type] = (acc[q.type] || 0) + 1;
      return acc;
    }, {});
    console.log(`Seeded ${inserted.length} questions from ${inputPath}`);
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
  } finally {
    await mongoose.disconnect();
  }
}
seedQuestions().catch(error => {
  console.error('Seeding error:', error.message || error);
  process.exit(1);
});
