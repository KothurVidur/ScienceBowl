const protestAdjudicationService = require('./protestAdjudicationService');

/**
 * Wrapper around protest adjudication provider (Gemini by default).
 * Returns a structured decision for score-adjustment negotiation.
 */
class ProtestNegotiationService {
  async decide({ questionText, correctAnswer, responses, proposals = [] }) {
    // No candidate proposal: fallback to basic protest adjudication.
    if (!Array.isArray(proposals) || proposals.length === 0) {
      const basic = await protestAdjudicationService.adjudicateProtest({
        questionText,
        correctAnswer,
        responses,
        protesters: []
      });
      return {
        accepted: Boolean(basic.accepted),
        chosenProposal: null,
        rationale: basic.rationale || 'No proposals provided.'
      };
    }

    // Default deterministic fallback:
    // choose the latest proposal if base adjudication accepts, else reject all.
    const basic = await protestAdjudicationService.adjudicateProtest({
      questionText,
      correctAnswer,
      responses,
      protesters: []
    });

    if (!basic.accepted) {
      return {
        accepted: false,
        chosenProposal: null,
        rationale: basic.rationale || 'Rejected by fallback adjudication.'
      };
    }

    const chosen = proposals[proposals.length - 1];
    return {
      accepted: true,
      chosenProposal: {
        player1Delta: Number(chosen.player1Delta || 0),
        player2Delta: Number(chosen.player2Delta || 0)
      },
      rationale: 'Accepted by fallback adjudication using latest proposal.'
    };
  }
}

module.exports = new ProtestNegotiationService();
