#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const fs = require('fs/promises');
const pdfParse = require('pdf-parse');
const { normalizeCategory, normalizeFormat, normalizeType } = require('../utils/questionSchema');
const { prompt: aiPrompt } = require('./prompt');

const CONFIG_PATH = path.resolve(__dirname, 'configuration.json');
const NATURAL_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const DEFAULT_CATEGORY_MAP = {
  math: 'Mathematics',
  mathematics: 'Mathematics',
  physics: 'Physics',
  chemistry: 'Chemistry',
  biology: 'Biology',
  'earth and space': 'Earth and Space',
  'earth & space': 'Earth and Space',
  'e&s': 'Earth and Space',
  'y-risk': 'Other',
  yrisk: 'Other',
  energy: 'Energy',
  estimation: 'Other',
  est: 'Other',
  other: 'Other',
  misc: 'Other',
  miscellaneous: 'Other',
  unknown: 'Other',
  astronomy: 'Earth and Space',
  'computer science': 'Other',
  computerscience: 'Other'
};

const normalizeWhitespace = (value) =>
  String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const dedupeCaseInsensitive = (values) => {
  const seen = new Set();
  return values.filter((value) => {
    const normalized = normalizeWhitespace(value);
    const key = normalized.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const parseRoundNumber = ({ fileName, index, roundNumberRegex, useRoundNumberFromFileName }) => {
  if (!useRoundNumberFromFileName) return index + 1;

  if (roundNumberRegex) {
    const customMatch = fileName.match(roundNumberRegex);
    if (customMatch && customMatch[1]) return Number(customMatch[1]);
  }

  const trailingNumberMatch = fileName.match(/(\d+)(?!.*\d)/);
  if (trailingNumberMatch && trailingNumberMatch[1]) return Number(trailingNumberMatch[1]);
  return index + 1;
};

const roundDifficulty = (roundNumber, totalRounds) => {
  const safeTotal = Math.max(1, Number(totalRounds) || 1);
  const numericRound = Math.min(Math.max(1, Number(roundNumber) || 1), safeTotal);
  return Number((numericRound / safeTotal).toFixed(2));
};

const toChoiceObject = (rawChoices = {}) => ({
  W: normalizeWhitespace(rawChoices.W),
  X: normalizeWhitespace(rawChoices.X),
  Y: normalizeWhitespace(rawChoices.Y),
  Z: normalizeWhitespace(rawChoices.Z)
});

const resolveCategory = ({ rawCategory, categoryMap, fallbackCategory, warnings, contextLabel }) => {
  const normalizedRaw = normalizeWhitespace(rawCategory);
  const mapped = categoryMap[normalizedRaw.toLowerCase()] || normalizedRaw;
  try {
    return normalizeCategory(mapped);
  } catch (_) {
    warnings.push(`${contextLabel}: invalid category "${normalizedRaw}" mapped to "${fallbackCategory}".`);
    return fallbackCategory;
  }
};

const normalizeTypeOrFallback = (rawType, warnings, contextLabel) => {
  const fallback = 'TOSSUP';
  try {
    return normalizeType(rawType || fallback);
  } catch (_) {
    warnings.push(`${contextLabel}: invalid type "${rawType}", defaulted to ${fallback}.`);
    return fallback;
  }
};

const normalizeFormatOrFallback = (rawFormat, warnings, contextLabel) => {
  const fallback = 'Short Answer';
  try {
    return normalizeFormat(rawFormat || fallback);
  } catch (_) {
    warnings.push(`${contextLabel}: invalid format "${rawFormat}", defaulted to ${fallback}.`);
    return fallback;
  }
};

const getOrderedPdfFiles = async (config) => {
  const folderEntries = await fs.readdir(config.pdfFolderPath, { withFileTypes: true });
  const discoveredPdfFiles = folderEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
    .map((entry) => entry.name)
    .sort((a, b) => NATURAL_COLLATOR.compare(a, b));

  if (!discoveredPdfFiles.length) {
    throw new Error(`No PDF files found in: ${config.pdfFolderPath}`);
  }

  if (!config.pdfFileOrder?.length) {
    return discoveredPdfFiles;
  }

  const discoveredSet = new Set(discoveredPdfFiles);
  const orderedSet = new Set();
  const unknownNames = [];
  const duplicateNames = [];

  config.pdfFileOrder.forEach((name) => {
    if (!discoveredSet.has(name)) unknownNames.push(name);
    if (orderedSet.has(name)) duplicateNames.push(name);
    orderedSet.add(name);
  });

  if (unknownNames.length) {
    throw new Error(`configuration.pdfFileOrder includes unknown files: ${unknownNames.join(', ')}`);
  }
  if (duplicateNames.length) {
    throw new Error(`configuration.pdfFileOrder has duplicates: ${duplicateNames.join(', ')}`);
  }

  const missingNames = discoveredPdfFiles.filter((name) => !orderedSet.has(name));
  if (missingNames.length) {
    throw new Error(`configuration.pdfFileOrder is missing files: ${missingNames.join(', ')}`);
  }

  return [...config.pdfFileOrder];
};

const toSchemaOrderedQuestion = ({
  source,
  type,
  format,
  category,
  difficulty,
  questionText,
  choices,
  answer,
  tags
}) => {
  const question = {
    source,
    type,
    format,
    category,
    difficulty,
    questionText
  };

  if (format === 'Multiple Choice') {
    question.choices = choices;
  }

  question.answer = answer;
  question.explanation = '';
  question.tags = tags;
  question.relatedTossup = null;
  question.isActive = true;

  return question;
};

const loadConfig = async () => {
  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  const config = JSON.parse(raw);
  const required = ['tournamentName', 'pdfFolderPath', 'numberOfRounds'];
  required.forEach((key) => {
    if (!config[key]) throw new Error(`configuration.json is missing required field "${key}".`);
  });

  const configDir = path.dirname(CONFIG_PATH);
  const pdfFolderPath = path.resolve(configDir, String(config.pdfFolderPath));
  const outputDirectory = config.outputDirectory
    ? path.resolve(configDir, String(config.outputDirectory))
    : path.dirname(pdfFolderPath);
  const roundNumberRegex = config.roundNumberRegex ? new RegExp(config.roundNumberRegex) : null;
  const useRoundNumberFromFileName = config.useRoundNumberFromFileName === true;

  const categoryMap = Object.entries({ ...DEFAULT_CATEGORY_MAP, ...(config.categoryMap || {}) })
    .reduce((acc, [key, value]) => {
      acc[String(key).toLowerCase()] = String(value);
      return acc;
    }, {});

  const fallbackCategory = normalizeCategory(config.fallbackCategory || 'Other');
  const strictRoundCount = config.strictRoundCount !== false;
  const defaultTags = Array.isArray(config.defaultTags)
    ? config.defaultTags.map((tag) => normalizeWhitespace(tag)).filter(Boolean)
    : [];
  const pdfFileOrder = Array.isArray(config.pdfFileOrder)
    ? config.pdfFileOrder.map((name) => normalizeWhitespace(name)).filter(Boolean)
    : null;

  return {
    tournamentName: normalizeWhitespace(config.tournamentName),
    pdfFolderPath,
    outputDirectory,
    numberOfRounds: Number(config.numberOfRounds),
    strictRoundCount,
    roundNumberRegex,
    useRoundNumberFromFileName,
    categoryMap,
    fallbackCategory,
    defaultTags,
    pdfFileOrder,
    ai: {
      model: normalizeWhitespace(config.aiModel || process.env.HF_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3'),
      temperature: Number.isFinite(Number(config.aiTemperature)) ? Number(config.aiTemperature) : 0.1,
      apiKey: normalizeWhitespace(
        config.huggingFaceApiKey ||
        config.aiApiKey ||
        process.env.HF_API_KEY ||
        process.env.HUGGINGFACE_API_KEY
      )
    }
  };
};

const normalizeAiQuestionsForRound = ({
  aiQuestions,
  fileName,
  roundNumber,
  totalRounds,
  packetName,
  categoryMap,
  fallbackCategory,
  defaultTags
}) => {
  const warnings = [];
  const output = [];
  const difficulty = roundDifficulty(roundNumber, totalRounds);

  aiQuestions.forEach((item, index) => {
    const inferredNumber = Number(item?.questionNumber);
    const questionNumber = Number.isFinite(inferredNumber) ? inferredNumber : index + 1;
    const contextLabel = `${fileName} #${index + 1}`;

    if (!Number.isFinite(inferredNumber)) {
      warnings.push(`${contextLabel}: missing/invalid questionNumber, defaulted to ${questionNumber}.`);
    }

    const type = normalizeTypeOrFallback(item?.type, warnings, contextLabel);
    const format = normalizeFormatOrFallback(item?.format, warnings, contextLabel);
    const category = resolveCategory({
      rawCategory: item?.category,
      categoryMap,
      fallbackCategory,
      warnings,
      contextLabel
    });
    const questionText = normalizeWhitespace(item?.questionText);
    const rawAlternates = Array.isArray(item?.answer?.alternates) ? item.answer.alternates : [];
    const answer = {
      canonical: normalizeWhitespace(item?.answer?.canonical),
      alternates: dedupeCaseInsensitive(rawAlternates.map((alt) => normalizeWhitespace(alt)))
    };
    const choices = toChoiceObject(item?.choices || {});

    if (!questionText) warnings.push(`${contextLabel}: empty questionText.`);
    if (!answer.canonical) warnings.push(`${contextLabel}: empty canonical answer.`);
    if (format === 'Multiple Choice') {
      ['W', 'X', 'Y', 'Z'].forEach((letter) => {
        if (!choices[letter]) warnings.push(`${contextLabel}: missing choice ${letter}.`);
      });
    }

    output.push(toSchemaOrderedQuestion({
      source: {
        packet: packetName,
        round: `${roundNumber}/${totalRounds}`,
        question: String(questionNumber)
      },
      type,
      format,
      category,
      difficulty,
      questionText,
      choices,
      answer,
      tags: [...defaultTags]
    }));
  });

  return { questions: output, warnings };
};

const run = async () => {
  const config = await loadConfig();
  if (!config.ai.apiKey) {
    throw new Error(
      'Missing HF_API_KEY (or HUGGINGFACE_API_KEY / configuration.huggingFaceApiKey).'
    );
  }

  const pdfFiles = await getOrderedPdfFiles(config);
  if (config.strictRoundCount && pdfFiles.length !== config.numberOfRounds) {
    throw new Error(
      `Round count mismatch: found ${pdfFiles.length} PDF files but configuration.numberOfRounds is ${config.numberOfRounds}.`
    );
  }

  const allQuestions = [];
  const allWarnings = [];

  for (let index = 0; index < pdfFiles.length; index += 1) {
    const fileName = pdfFiles[index];
    const filePath = path.join(config.pdfFolderPath, fileName);
    const roundNumber = parseRoundNumber({
      fileName,
      index,
      roundNumberRegex: config.roundNumberRegex,
      useRoundNumberFromFileName: config.useRoundNumberFromFileName
    });

    const pdfRaw = await fs.readFile(filePath);
    const pdfData = await pdfParse(pdfRaw);
    const text = String(pdfData.text || '').trim();
    if (!text) {
      allWarnings.push(`${fileName}: extracted empty text.`);
      continue;
    }

    console.log(`Sending ${fileName} to Hugging Face (${config.ai.model})...`);
    const aiQuestions = await aiPrompt(text, {
      apiKey: config.ai.apiKey,
      model: config.ai.model,
      temperature: config.ai.temperature
    });

    const { questions, warnings } = normalizeAiQuestionsForRound({
      aiQuestions,
      fileName,
      roundNumber,
      totalRounds: config.numberOfRounds,
      packetName: config.tournamentName,
      categoryMap: config.categoryMap,
      fallbackCategory: config.fallbackCategory,
      defaultTags: config.defaultTags
    });

    allQuestions.push(...questions);
    allWarnings.push(...warnings);
    console.log(`Parsed ${questions.length} AI questions from ${fileName} (round ${roundNumber}).`);
  }

  const folderName = path.basename(config.pdfFolderPath);
  const outputPath = path.join(config.outputDirectory, `${folderName}.json`);
  await fs.mkdir(config.outputDirectory, { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(allQuestions, null, 2)}\n`, 'utf8');

  console.log(`\nWrote ${allQuestions.length} questions to ${outputPath}`);
  if (allWarnings.length) {
    console.log(`\nWarnings (${allWarnings.length}):`);
    allWarnings.forEach((warning) => console.log(`- ${warning}`));
  } else {
    console.log('\nNo warnings.');
  }
};

run().catch((error) => {
  console.error(`AI pipeline failed: ${error.message || error}`);
  process.exit(1);
});
