#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const vm = require('vm');
const mongoose = require('mongoose');
const Question = require('../models/Question');
const { normalizeQuestionPayload } = require('./questionSchema');

const DEFAULT_INPUT_PATH = path.join(__dirname, '../questions/aves.txt');

async function loadQuestionArray(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');

  // Prefer strict JSON first.
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Input JSON must be an array.');
    return parsed;
  } catch (_) {
    // Fall back to JS array literal format (used by aves.txt).
    const parsed = vm.runInNewContext(`(${raw})`, {}, { timeout: 2500 });
    if (!Array.isArray(parsed)) throw new Error('Input file must evaluate to an array of question objects.');
    return parsed;
  }
}

async function seedQuestions() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INPUT_PATH;
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sciencebowl';

  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const rawQuestions = await loadQuestionArray(inputPath);
    if (!rawQuestions.length) {
      throw new Error(`No questions found in ${inputPath}`);
    }

    const normalized = rawQuestions.map((q, index) => {
      try {
        return normalizeQuestionPayload(q);
      } catch (error) {
        throw new Error(`Question ${index + 1} invalid: ${error.message}`);
      }
    });

    const tossups = normalized.filter((q) => q.type === 'TOSSUP');
    const bonuses = normalized.filter((q) => q.type === 'BONUS');
    if (!tossups.length || !bonuses.length) {
      throw new Error('Question set must include at least one TOSSUP and one BONUS.');
    }

    await Question.deleteMany({});
    console.log('Cleared existing questions');

    // Link bonus questions to tossups in the same category when possible.
    const tossupDocs = tossups.map((q) => ({ ...q, _id: new mongoose.Types.ObjectId() }));
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
        relatedTossup: linkedTossup?._id || null
      };
    });

    const inserted = await Question.insertMany([...tossupDocs, ...bonusDocs], { ordered: false });
    console.log(`Inserted ${inserted.length} questions from ${inputPath}`);

    const stats = await Question.aggregate([
      { $group: { _id: { type: '$type', category: '$category' }, count: { $sum: 1 } } },
      { $sort: { '_id.type': 1, '_id.category': 1 } }
    ]);

    console.log('\nSeed summary by type/category:');
    stats.forEach((s) => {
      console.log(`  ${s._id.type} | ${s._id.category}: ${s.count}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error.message || error);
    process.exit(1);
  }
}

seedQuestions();
