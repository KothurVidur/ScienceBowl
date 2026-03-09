const protestAdjudicationService = require('./protestAdjudicationService');
class ProtestNegotiationService {
  async decide({
    questionText,
    correctAnswer,
    responses,
    proposals = []
  }) {
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
