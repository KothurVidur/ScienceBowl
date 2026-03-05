#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const { normalizeQuestionPayload } = require('./questionSchema');

async function migrateQuestionSchema() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sciencebowl';
  await mongoose.connect(mongoUri);
  const collection = mongoose.connection.collection('questions');

  const cursor = collection.find({});
  const ops = [];
  let total = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) continue;
    total += 1;

    const migrationInput = { ...doc };
    if (typeof migrationInput.answer === 'string') {
      migrationInput.answer = {
        canonical: migrationInput.answer,
        alternates: Array.isArray(migrationInput.alternateAnswers) ? migrationInput.alternateAnswers : []
      };
    }
    if (migrationInput.source && typeof migrationInput.source === 'object') {
      migrationInput.source = {
        packet: migrationInput.source.packet || migrationInput.source.set || '',
        round: migrationInput.source.round || '',
        question: migrationInput.source.question || migrationInput.source.questionNumber || ''
      };
    }

    const normalized = normalizeQuestionPayload(migrationInput);

    const nextDoc = {
      ...normalized,
      stats: doc.stats || { timesAsked: 0, timesCorrect: 0, averageResponseTime: 0 },
      isActive: doc.isActive !== false,
      relatedTossup: doc.relatedTossup || null,
      createdAt: doc.createdAt || new Date(),
      updatedAt: new Date()
    };

    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: nextDoc,
          $unset: {
            alternateAnswers: '',
            'source.year': '',
            'source.set': '',
            'source.questionNumber': ''
          }
        }
      }
    });

    if (ops.length >= 250) {
      await collection.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
  }

  if (ops.length > 0) {
    await collection.bulkWrite(ops, { ordered: false });
  }

  const sample = await collection.findOne({}, { projection: { type: 1, format: 1, category: 1, difficulty: 1, answer: 1 } });
  console.log(`Migrated ${total} question documents to canonical schema.`);
  console.log('Sample normalized doc:', sample);

  await mongoose.disconnect();
}

migrateQuestionSchema()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('Question schema migration failed:', error);
    try {
      await mongoose.disconnect();
    } catch (_) {
      // ignore
    }
    process.exit(1);
  });
