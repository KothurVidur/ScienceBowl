/**
 * ============================================================================
 * PROTEST ADJUDICATION SERVICE
 * ============================================================================
 *
 * Wrapper service for protest tie-break decisions.
 *
 * Provider design:
 * - Default provider is Gemini (if GEMINI_API_KEY is set)
 * - Falls back to deterministic local adjudication when API is unavailable
 *
 * To swap providers later, replace adjudicateWithProvider() internals.
 * ============================================================================
 */

class ProtestAdjudicationService {
  constructor() {
    this.provider = process.env.PROTEST_AI_PROVIDER || 'gemini';
    this.geminiApiKey = process.env.GEMINI_API_KEY || '';
    this.geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  }

  async adjudicateProtest({ questionText, correctAnswer, responses, protesters }) {
    try {
      if (this.provider === 'gemini' && this.geminiApiKey) {
        return await this.adjudicateWithGemini({
          questionText,
          correctAnswer,
          responses,
          protesters
        });
      }
    } catch (error) {
      console.error('[ProtestAdjudication] Provider error, using fallback:', error?.message || error);
    }

    // Safe fallback: accept only if any protested answer exactly matches correct answer
    const normalizedCorrect = this.normalize(correctAnswer);
    const protestedAnswers = (protesters || [])
      .map((playerId) => responses?.[playerId]?.answer || '')
      .map((answer) => this.normalize(answer))
      .filter(Boolean);

    const accepted = protestedAnswers.some((answer) => answer === normalizedCorrect);
    return {
      accepted,
      decidedBy: 'fallback',
      rationale: accepted
        ? 'Fallback adjudication: protested answer matched correct answer.'
        : 'Fallback adjudication: protested answers did not match correct answer.'
    };
  }

  async adjudicateWithGemini({ questionText, correctAnswer, responses, protesters }) {
    const prompt = [
      'You are judging a Science Bowl protest.',
      'Return strict JSON with keys: accepted (boolean), rationale (string).',
      'Accept if the protested answer(s) should be considered correct for the question intent.',
      `Question: ${questionText}`,
      `Official correct answer: ${correctAnswer}`,
      `Responses JSON: ${JSON.stringify(responses || {})}`,
      `Protesters: ${JSON.stringify(protesters || [])}`
    ].join('\n');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;
    const geminiResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      })
    });

    if (!geminiResponse.ok) {
      throw new Error(`Gemini HTTP ${geminiResponse.status}`);
    }

    const data = await geminiResponse.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    return {
      accepted: Boolean(parsed.accepted),
      decidedBy: 'gemini',
      rationale: String(parsed.rationale || 'Gemini adjudication completed.')
    };
  }

  normalize(text) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
  }
}

module.exports = new ProtestAdjudicationService();
