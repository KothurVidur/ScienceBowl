#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const QUESTIONS_DIR = __dirname;
const CONFIG_PATH = path.join(QUESTIONS_DIR, 'configuration.json');
const DEFAULT_INPUT = path.join(QUESTIONS_DIR, 'raw2.json');
const DEFAULT_OUTPUT = path.join(QUESTIONS_DIR, 'raw_converted.json');

// User-specified round sequence for this conversion.
const ROUND_ORDER = [2, 4, 5, 8, 9, 10, 12];

const TYPE_MAP = {
  T: 'TOSSUP',
  B: 'BONUS',
  TOSSUP: 'TOSSUP',
  BONUS: 'BONUS'
};

const FORMAT_MAP = {
  SA: 'Short Answer',
  MC: 'Multiple Choice',
  'SHORT ANSWER': 'Short Answer',
  'MULTIPLE CHOICE': 'Multiple Choice'
};

const CATEGORY_MAP = {
  M: 'Mathematics',
  P: 'Physics',
  C: 'Chemistry',
  B: 'Biology',
  S: 'Earth and Space',
  E: 'Energy',
  O: 'Other',
  MATHEMATICS: 'Mathematics',
  PHYSICS: 'Physics',
  CHEMISTRY: 'Chemistry',
  BIOLOGY: 'Biology',
  'EARTH AND SPACE': 'Earth and Space',
  ENERGY: 'Energy',
  OTHER: 'Other'
};

const normalizeWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const toUpperTrimmed = (value) => normalizeWhitespace(value).toUpperCase();

const roundDifficulty = (roundIndex, totalRounds) => {
  const safeTotal = Math.max(1, Number(totalRounds) || 1);
  const numericRound = Math.min(Math.max(1, Number(roundIndex) || 1), safeTotal);
  return Number((numericRound / safeTotal).toFixed(2));
};

const normalizeType = (rawType, context) => {
  const key = toUpperTrimmed(rawType);
  const mapped = TYPE_MAP[key];
  if (!mapped) throw new Error(`${context}: invalid type "${rawType}"`);
  return mapped;
};

const normalizeFormat = (rawFormat, context) => {
  const key = toUpperTrimmed(rawFormat);
  const mapped = FORMAT_MAP[key];
  if (!mapped) throw new Error(`${context}: invalid format "${rawFormat}"`);
  return mapped;
};

const normalizeCategory = (rawCategory, context) => {
  const key = toUpperTrimmed(rawCategory);
  const mapped = CATEGORY_MAP[key];
  if (!mapped) throw new Error(`${context}: invalid category "${rawCategory}"`);
  return mapped;
};

const normalizeChoices = (rawChoices) => {
  if (!Array.isArray(rawChoices)) {
    return { W: '', X: '', Y: '', Z: '' };
  }

  const cleaned = rawChoices.map((choice) => normalizeWhitespace(choice).replace(/^[WXYZ]\)\s*/i, ''));
  return {
    W: cleaned[0] || '',
    X: cleaned[1] || '',
    Y: cleaned[2] || '',
    Z: cleaned[3] || ''
  };
};

const detectRoundIndexPerQuestion = (rawList) => {
  let roundIndex = 0;
  let previousQuestionNumber = null;

  return rawList.map((item, idx) => {
    const questionNumber = Number(item?.n);
    if (!Number.isFinite(questionNumber)) {
      throw new Error(`Question #${idx + 1}: invalid n "${item?.n}"`);
    }

    if (previousQuestionNumber !== null && questionNumber < previousQuestionNumber) {
      roundIndex += 1;
    }
    previousQuestionNumber = questionNumber;

    return roundIndex;
  });
};

const parseCliArgs = () => {
  const args = process.argv.slice(2);
  const positional = [];
  let inputArg;
  let outputArg;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--input' || arg === '-i') {
      inputArg = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--output' || arg === '-o') {
      outputArg = args[i + 1];
      i += 1;
      continue;
    }
    positional.push(arg);
  }

  return {
    inputArg: inputArg || positional[0],
    outputArg: outputArg || positional[1]
  };
};

const normalizeRawOutputQuestions = (rawOutput, context) => {
  if (Array.isArray(rawOutput)) return rawOutput;

  if (typeof rawOutput === 'string') {
    const trimmed = rawOutput.trim();
    if (!trimmed) return [];
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.questions)) {
      return parsed.questions;
    }
  }

  if (rawOutput && typeof rawOutput === 'object' && Array.isArray(rawOutput.questions)) {
    return rawOutput.questions;
  }

  throw new Error(`${context}: rawOutput must be a JSON array (or JSON string containing an array).`);
};

const buildConversionRows = (rawInput) => {
  if (Array.isArray(rawInput)) {
    const roundIndices = detectRoundIndexPerQuestion(rawInput);
    const totalRounds = ROUND_ORDER.length;

    const rows = rawInput.map((item, idx) => {
      const roundSequenceIndex = roundIndices[idx];
      if (roundSequenceIndex >= ROUND_ORDER.length) {
        throw new Error(
          `Question #${idx + 1}: detected more rounds than ROUND_ORDER supports (index ${roundSequenceIndex}).`
        );
      }

      return {
        item,
        idx,
        roundNumber: ROUND_ORDER[roundSequenceIndex],
        roundPosition: roundSequenceIndex,
        totalRounds
      };
    });

    return { rows, mode: 'flat-array' };
  }

  if (rawInput && typeof rawInput === 'object' && Array.isArray(rawInput.rawOutputs)) {
    const roundOrder = [];
    const rowBuffer = [];
    let globalIndex = 0;

    rawInput.rawOutputs.forEach((entry, batchIndex) => {
      const parsedRound = Number(entry?.round);
      const roundNumber = Number.isFinite(parsedRound) ? parsedRound : (batchIndex + 1);

      if (!roundOrder.includes(roundNumber)) {
        roundOrder.push(roundNumber);
      }

      const rawQuestions = normalizeRawOutputQuestions(
        entry?.rawOutput,
        `rawOutputs[${batchIndex + 1}]`
      );

      rawQuestions.forEach((item) => {
        rowBuffer.push({
          item,
          idx: globalIndex,
          roundNumber
        });
        globalIndex += 1;
      });
    });

    const roundPositionMap = new Map(roundOrder.map((round, index) => [round, index]));
    const totalRounds = roundOrder.length;

    const rows = rowBuffer.map((row) => ({
      ...row,
      roundPosition: roundPositionMap.get(row.roundNumber),
      totalRounds
    }));

    return { rows, mode: 'raw-outputs-wrapper' };
  }

  throw new Error('Input JSON must be either a question array or an object containing rawOutputs[].');
};

const convertOne = ({ item, idx, roundNumber, roundPosition, totalRounds, packetName }) => {
  const context = `Question #${idx + 1}`;

  const qNumber = Number(item?.n);
  if (!Number.isFinite(qNumber)) {
    throw new Error(`${context}: invalid n "${item?.n}"`);
  }

  const type = normalizeType(item?.t, context);
  const format = normalizeFormat(item?.f, context);
  const category = normalizeCategory(item?.c, context);

  const questionText = normalizeWhitespace(item?.q);
  if (!questionText) {
    throw new Error(`${context}: empty q/questionText`);
  }

  const rawAnswer = item?.a && typeof item.a === 'object' ? item.a : {};
  const canonical = normalizeWhitespace(rawAnswer.c);
  const alternates = Array.isArray(rawAnswer.a)
    ? rawAnswer.a.map((alt) => normalizeWhitespace(alt)).filter(Boolean)
    : [];

  if (!canonical) {
    throw new Error(`${context}: empty answer canonical`);
  }

  const output = {
    source: {
      packet: packetName,
      round: `${roundNumber}/${totalRounds}`,
      question: String(qNumber)
    },
    type,
    format,
    category,
    difficulty: roundDifficulty(roundPosition + 1, totalRounds),
    questionText,
    answer: {
      canonical,
      alternates
    },
    explanation: '',
    tags: item?.m ? ['manual-review'] : [],
    relatedTossup: null,
    isActive: true
  };

  if (format === 'Multiple Choice') {
    output.choices = normalizeChoices(item?.cs);
  }

  return output;
};

const run = async () => {
  const { inputArg, outputArg } = parseCliArgs();

  const inputPath = path.resolve(inputArg || DEFAULT_INPUT);
  const outputPath = path.resolve(outputArg || DEFAULT_OUTPUT);

  const [rawText, configText] = await Promise.all([
    fs.readFile(inputPath, 'utf8'),
    fs.readFile(CONFIG_PATH, 'utf8')
  ]);

  const raw = JSON.parse(rawText);
  const config = JSON.parse(configText);

  const packetName = normalizeWhitespace(config?.tournamentName || 'Unknown Tournament');
  const { rows, mode } = buildConversionRows(raw);

  const converted = rows.map(({ item, idx, roundNumber, roundPosition, totalRounds }) => {
    return convertOne({
      item,
      idx,
      roundNumber,
      roundPosition,
      totalRounds,
      packetName
    });
  });

  await fs.writeFile(outputPath, `${JSON.stringify(converted, null, 2)}\n`, 'utf8');

  console.log(`Converted ${converted.length} questions.`);
  console.log(`Input : ${inputPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Input mode: ${mode}`);
  if (mode === 'flat-array') {
    console.log(`Round order used: ${ROUND_ORDER.join(', ')}`);
  }
};

run().catch((error) => {
  console.error(`Conversion failed: ${error.message || error}`);
  process.exit(1);
});
