#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const Question = require('../models/Question');
const {
  normalizeQuestionPayload
} = require('../utils/questionSchema');
const ALLOWED_IMPORT_FORMATS = new Set(['Short Answer', 'Multiple Choice']);
const assertImporterFormat = item => {
  const rawFormat = String(item?.format || '').trim();
  if (!ALLOWED_IMPORT_FORMATS.has(rawFormat)) {
    throw new Error(`format must be exactly "Short Answer" or "Multiple Choice" (received "${rawFormat || '<empty>'}")`);
  }
};
async function importQuestions() {
  const inputArg = process.argv[2];
  const shouldReplace = process.argv.includes('--replace');
  if (!inputArg) {
    throw new Error('Missing input path. Example: node src/questions/importQuestionsFromJson.js ./src/questions/sample.json');
  }
  const inputPath = path.resolve(inputArg);
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sciencebowl';
  const raw = await fs.readFile(inputPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${inputPath}: ${error.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Input JSON must be an array of question objects.');
  }
  if (parsed.length === 0) {
    throw new Error('Input JSON array is empty.');
  }
  const normalized = parsed.map((item, index) => {
    try {
      assertImporterFormat(item);
      const normalizedItem = normalizeQuestionPayload(item);
      if (!normalizedItem.questionText) {
        throw new Error('questionText is required');
      }
      if (!normalizedItem.answer?.canonical) {
        throw new Error('answer.canonical is required');
      }
      return normalizedItem;
    } catch (error) {
      throw new Error(`Question #${index + 1} invalid: ${error.message}`);
    }
  });
  await mongoose.connect(mongoUri);
  if (shouldReplace) {
    await Question.deleteMany({});
    console.log('Cleared existing questions before import (--replace).');
  }
  const result = await Question.insertMany(normalized, {
    ordered: false
  });
  const byType = result.reduce((acc, q) => {
    acc[q.type] = (acc[q.type] || 0) + 1;
    return acc;
  }, {});
  console.log(`Imported ${result.length} questions from ${inputPath}`);
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  await mongoose.disconnect();
}
importQuestions().then(() => process.exit(0)).catch(async error => {
  console.error('Import failed:', error.message || error);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
