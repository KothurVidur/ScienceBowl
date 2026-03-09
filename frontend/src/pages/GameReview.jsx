import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { gameAPI, questionAPI } from '../services/api';
import Button from '../components/Button';
import Card from '../components/Card';
import { FiArrowLeft, FiCheck, FiX, FiFlag } from 'react-icons/fi';
import toast from 'react-hot-toast';
import styles from './GameReview.module.css';
const GameReview = () => {
  const {
    gameId
  } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    user
  } = useAuth();
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState(null);
  const [error, setError] = useState('');
  const [isLeaving, setIsLeaving] = useState(false);
  const [reportingById, setReportingById] = useState({});
  const [reportedById, setReportedById] = useState({});
  useEffect(() => {
    const fetchReview = async () => {
      try {
        const response = await gameAPI.getReview(gameId);
        setReview(response.data?.data || null);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load game review');
      } finally {
        setLoading(false);
      }
    };
    if (gameId) fetchReview();
  }, [gameId]);
  const viewerPlayerId = useMemo(() => {
    if (!review?.game || !user?.id) return null;
    if (String(review.game.player1?.userId) === String(user.id)) return 'player1';
    if (String(review.game.player2?.userId) === String(user.id)) return 'player2';
    return null;
  }, [review, user]);
  const questions = review?.questions || [];
  const cycles = useMemo(() => {
    const grouped = [];
    for (let i = 0; i < questions.length; i += 2) {
      grouped.push({
        cycle: Math.floor(i / 2) + 1,
        tossup: questions[i] || null,
        bonus: questions[i + 1] || null
      });
    }
    return grouped;
  }, [questions]);
  const unresolvedCount = questions.filter(q => {
    const protest = q.protest || {};
    return Boolean((protest.protestedBy || []).length) && !protest.resolved;
  }).length;
  useEffect(() => {
    if (!gameId || unresolvedCount <= 0) return undefined;
    if (isLeaving) return undefined;
    const interval = setInterval(() => {
      gameAPI.getReview(gameId).then(response => {
        setReview(response.data?.data || null);
      }).catch(() => {});
    }, 1500);
    return () => clearInterval(interval);
  }, [gameId, unresolvedCount, isLeaving]);
  const handleLeaveReview = async targetPath => {
    try {
      setIsLeaving(true);
    } catch (err) {
      console.error('Failed to leave review:', err);
    } finally {
      setIsLeaving(false);
      navigate(targetPath);
    }
  };
  const handleReportQuestion = async questionId => {
    const id = String(questionId || '');
    if (!id || reportingById[id]) return;
    try {
      setReportingById(prev => ({
        ...prev,
        [id]: true
      }));
      const response = await questionAPI.report(id);
      const alreadyReported = Boolean(response?.data?.data?.alreadyReported);
      setReportedById(prev => ({
        ...prev,
        [id]: true
      }));
      toast.success(alreadyReported ? 'Question already reported' : 'Question reported');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to report question');
    } finally {
      setReportingById(prev => {
        const next = {
          ...prev
        };
        delete next[id];
        return next;
      });
    }
  };
  if (loading) {
    return <div className={styles.stateScreen}>Loading game review...</div>;
  }
  if (error || !review?.game) {
    return <div className={styles.stateScreen}>
        <p>{error || 'Game review unavailable'}</p>
        <Button variant="secondary" onClick={() => navigate('/dashboard')} icon={<FiArrowLeft />}>
          Back
        </Button>
      </div>;
  }
  const {
    game
  } = review;
  const query = new URLSearchParams(location.search || '');
  const canPlayAgain = Boolean(location.state?.fromGameComplete || query.get('from') === 'complete');
  const profileUsernameFromQuery = query.get('from') === 'profile' ? query.get('u') : null;
  const profileUsernameFromState = location.state?.fromProfile ? location.state?.profileUsername : null;
  const profileReturnUsername = profileUsernameFromState || profileUsernameFromQuery;
  const profileReturnPath = profileReturnUsername ? `/profile/${profileReturnUsername}` : null;
  const player1Name = game.player1?.username || 'Player 1';
  const player2Name = game.player2?.isAI ? game.player2?.username || 'AI' : game.player2?.username || 'Player 2';
  const winnerName = game.winner === 'player1' ? player1Name : game.winner === 'player2' ? player2Name : game.winner === 'tie' ? 'Tie' : game.winner || 'N/A';
  const playAgainPath = String(game.gameType || '') === 'ranked' ? '/play?mode=ranked&autoQueue=1' : String(game.gameType || '') === 'unranked_1v1' ? '/play?mode=unranked&autoQueue=1' : '/play';
  return <div className={styles.reviewPage}>
      <header className={styles.header}>
        <div>
          <h1>Game Review</h1>
          <p>Game {game.gameCode} • {game.score.player1} - {game.score.player2}</p>
          <p className={styles.unresolvedBadge}>
            Unresolved Protests: <strong>{unresolvedCount}</strong>
          </p>
        </div>
        <div className={styles.actions}>
          {canPlayAgain && <Button variant="primary" onClick={() => handleLeaveReview(playAgainPath)} disabled={isLeaving}>
              {isLeaving ? 'Leaving...' : 'Play Again'}
            </Button>}
          {profileReturnPath && <Button variant="secondary" onClick={() => handleLeaveReview(profileReturnPath)} icon={<FiArrowLeft />} disabled={isLeaving}>
              Back to Profile
            </Button>}
          <Button variant="secondary" onClick={() => handleLeaveReview('/dashboard')} icon={<FiArrowLeft />} disabled={isLeaving}>
            Dashboard
          </Button>
        </div>
      </header>

      <section className={styles.summary}>
        <Card>
          <div className={styles.summaryGrid}>
            <div>
              <span className={styles.label}>{player1Name}</span>
              <strong>{game.score.player1}</strong>
            </div>
            <div>
              <span className={styles.label}>{player2Name}</span>
              <strong>{game.score.player2}</strong>
            </div>
            <div>
              <span className={styles.label}>Winner</span>
              <strong>{winnerName}</strong>
            </div>
            <div>
              <span className={styles.label}>Cycles</span>
              <strong>{cycles.length}</strong>
            </div>
          </div>
        </Card>
      </section>

      <section className={styles.questionList}>
        {cycles.map(cycle => {
        const renderQuestionBlock = (q, phaseLabel, cycleNumber, emptyMessage) => {
          if (!q) {
            return <div className={styles.questionCard}>
                  <div className={styles.questionHeader}>
                    <h3>{phaseLabel} • Q{cycleNumber}</h3>
                  </div>
                  <p className={styles.questionText}>{emptyMessage}</p>
                </div>;
          }
          const player1Resp = q.player1Response || {};
          const player2Resp = q.player2Response || {};
          const player1Points = q.pointsAwarded?.player1 || 0;
          const player2Points = q.pointsAwarded?.player2 || 0;
          const myPlayerId = viewerPlayerId;
          const protest = q.protest || {};
          const protestedBy = protest.protestedBy || [];
          const protestedByNames = protestedBy.map(pid => {
            if (pid === 'player1') return game.player1?.username || 'Player 1';
            if (pid === 'player2') return game.player2?.isAI ? game.player2?.username || 'AI' : game.player2?.username || 'Player 2';
            return pid;
          });
          const hasProtest = protestedBy.length > 0;
          const myVote = myPlayerId ? protest.votes?.[myPlayerId] || null : null;
          const reportId = String(q.questionId || '');
          const isReporting = Boolean(reportingById[reportId]);
          const isReported = Boolean(reportedById[reportId]);
          return <div className={styles.questionCard}>
                <div className={styles.questionHeader}>
                  <h3>{phaseLabel} • Q{cycleNumber} • {q.category}</h3>
                  <div className={styles.questionMeta}>
                    <span className={styles.format}>{q.format === 'mc' ? 'Multiple Choice' : 'Short Answer'}</span>
                    <button type="button" className={styles.reportButton} onClick={() => handleReportQuestion(reportId)} disabled={!reportId || isReporting} title="Report question">

                      <FiFlag />
                      <span>{isReported ? 'Reported' : isReporting ? 'Reporting...' : 'Report Question'}</span>
                    </button>
                  </div>
                </div>
                <p className={styles.questionText}>{q.questionText}</p>

                {q.format === 'mc' && q.choices && <div className={styles.choices}>
                    {Object.entries(q.choices).map(([key, value]) => <div key={key}><strong>{key}.</strong> {value}</div>)}
                  </div>}

                <div className={styles.answersGrid}>
                  <div className={styles.answerBlock}>
                    <span className={styles.label}>{player1Name} answer</span>
                    <div className={styles.answerLine}>
                      {player1Resp?.isCorrect ? <FiCheck className={styles.correct} /> : <FiX className={styles.incorrect} />}
                      <span>{player1Resp?.answer || 'No answer'}</span>
                    </div>
                    <small>Points: {player1Points >= 0 ? `+${player1Points}` : player1Points}</small>
                  </div>
                  <div className={styles.answerBlock}>
                    <span className={styles.label}>{player2Name} answer</span>
                    <div className={styles.answerLine}>
                      {player2Resp?.isCorrect ? <FiCheck className={styles.correct} /> : <FiX className={styles.incorrect} />}
                      <span>{player2Resp?.answer || 'No answer'}</span>
                    </div>
                    <small>Points: {player2Points >= 0 ? `+${player2Points}` : player2Points}</small>
                  </div>
                  <div className={styles.answerBlock}>
                    <span className={styles.label}>Correct answer</span>
                    <div className={styles.answerLine}>
                      <span>{q.correctAnswer}</span>
                    </div>
                    <small className={styles.answerMeta}>
                      Difficulty: {String(q.difficultyBand || 'unknown')}
                      {typeof q.difficulty === 'number' ? ` (${q.difficulty.toFixed(2)})` : ''}
                    </small>
                  </div>
                </div>

                {hasProtest && <div className={styles.protestBox}>
                    <span className={styles.label}>
                      Protested by: {protestedByNames.join(', ')}
                    </span>
                    {protest.resolved ? <p className={styles.protestStatus}>
                        Result: {protest.accepted ? 'Accepted' : 'Rejected'} ({protest.decidedBy || 'unknown'})
                        {protest.rationale ? ` - ${protest.rationale}` : ''}
                      </p> : <div className={styles.protestVoteRow}>
                        <span className={styles.protestStatus}>
                          Status: Pending AI adjudication
                        </span>
                        <span className={styles.protestStatus}>Your vote: {myVote || 'N/A'}</span>
                      </div>}
                  </div>}
              </div>;
        };
        return <Card key={`cycle-${cycle.cycle}`} className={styles.cycleCard}>
              <div className={styles.cycleHeader}>
                <h2>Cycle {cycle.cycle}</h2>
              </div>
              <div className={styles.cycleBody}>
                {renderQuestionBlock(cycle.tossup, 'Tossup', cycle.cycle, 'Tossup data unavailable.')}
                {renderQuestionBlock(cycle.bonus, 'Bonus', cycle.cycle, 'Bonus was not recorded for this cycle.')}
              </div>
            </Card>;
      })}
      </section>
    </div>;
};
export default GameReview;
