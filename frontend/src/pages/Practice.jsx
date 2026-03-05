import { useState, useEffect, useCallback } from 'react';
import { questionAPI } from '../services/api';
import { FiRefreshCw, FiCheck, FiX, FiFilter, FiClock, FiFlag } from 'react-icons/fi';
import Button from '../components/Button';
import Card from '../components/Card';
import toast from 'react-hot-toast';
import styles from './Practice.module.css';

const WORD_REVEAL_PACE_MS = 320;
const MC_OPTION_PREFIX_PAUSE_MS = 280;
const MC_OPTION_STEP_MS = 950;
const STALL_TIMEOUT_SECONDS = 2;
const TYPING_HARD_CAP_MS = 60000;

const Practice = () => {
  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [difficultyRange, setDifficultyRange] = useState({ min: 0, max: 1 });
  const [practiceMode, setPracticeMode] = useState('question'); // question | reading
  const [scope, setScope] = useState('tossup'); // tossup | bonus | cycle
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(30);

  const [question, setQuestion] = useState(null);
  const [cycleContext, setCycleContext] = useState(null); // { stage, tossup, bonus }
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [timeLeft, setTimeLeft] = useState(null);
  const [timerStartAt, setTimerStartAt] = useState(0);
  const [stallSecondsLeft, setStallSecondsLeft] = useState(STALL_TIMEOUT_SECONDS);
  const [typingStartedAt, setTypingStartedAt] = useState(0);
  const [lastProgressAt, setLastProgressAt] = useState(0);
  const [bestProgress, setBestProgress] = useState(0);
  const [hardCapAt, setHardCapAt] = useState(0);
  const [displayedQuestionText, setDisplayedQuestionText] = useState('');
  const [visibleChoices, setVisibleChoices] = useState({ W: '', X: '', Y: '', Z: '' });
  const [reportingQuestionId, setReportingQuestionId] = useState('');

  const getConfiguredTimerSeconds = useCallback((nextQuestion) => {
    if (!nextQuestion) return null;
    if (practiceMode === 'question') return timerEnabled ? Number(timeLimitSeconds || 30) : null;
    return nextQuestion.type === 'bonus' ? 20 : 2;
  }, [practiceMode, timerEnabled, timeLimitSeconds]);

  const resetPerQuestionState = useCallback((nextQuestion) => {
    setResult(null);
    setAnswer('');
    setDisplayedQuestionText('');
    setVisibleChoices({ W: '', X: '', Y: '', Z: '' });
    setTimeLeft(getConfiguredTimerSeconds(nextQuestion));
    setTimerStartAt(Number.MAX_SAFE_INTEGER);
    setStallSecondsLeft(STALL_TIMEOUT_SECONDS);
    setTypingStartedAt(0);
    setLastProgressAt(0);
    setBestProgress(0);
    setHardCapAt(0);
  }, [getConfiguredTimerSeconds]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await questionAPI.getCategories();
        setCategories(response.data.data.categories);
      } catch (err) {
        console.error('Failed to load categories:', err);
      }
    };
    fetchCategories();
  }, []);

  const fetchQuestion = useCallback(async () => {
    setLoading(true);
    setQuestion(null);
    setCycleContext(null);
    resetPerQuestionState(null);

    try {
      const params = {};
      if (selectedCategories.length) params.category = selectedCategories.join(',');
      params.difficultyMin = Number(difficultyRange.min).toFixed(2);
      params.difficultyMax = Number(difficultyRange.max).toFixed(2);
      params.type = scope;

      const response = await questionAPI.getPractice(params);
      const cycle = response.data?.data?.cycle;
      const nextQuestion = cycle ? cycle.tossup : response.data?.data?.question;

      if (!nextQuestion) {
        toast.error('No question available');
        return;
      }

      if (cycle) {
        setCycleContext({
          stage: 'tossup',
          tossup: cycle.tossup,
          bonus: cycle.bonus
        });
      }

      setQuestion(nextQuestion);
      resetPerQuestionState(nextQuestion);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load question');
    } finally {
      setLoading(false);
    }
  }, [selectedCategories, difficultyRange, scope, resetPerQuestionState]);

  const goToBonusInCycle = useCallback(() => {
    if (!cycleContext?.bonus) return;
    setCycleContext((prev) => prev ? ({ ...prev, stage: 'bonus' }) : prev);
    setQuestion(cycleContext.bonus);
    resetPerQuestionState(cycleContext.bonus);
  }, [cycleContext, resetPerQuestionState]);

  const handleSubmit = useCallback(async () => {
    if (!question) return;
    const userAnswer = String(answer || '').trim();
    if (!userAnswer) {
      toast.error('Please provide an answer');
      return;
    }

    try {
      const response = await questionAPI.checkAnswer(question.id, userAnswer);
      const {
        isCorrect,
        correctAnswer,
        acceptedAlternates,
        alternateAnswers
      } = response.data.data;
      const isCycleTossup = scope === 'cycle' && cycleContext?.stage === 'tossup';
      const canAdvanceToBonus = Boolean(isCycleTossup && isCorrect && cycleContext?.bonus);

      setResult({
        isCorrect,
        correctAnswer,
        alternateAnswers: acceptedAlternates || alternateAnswers || [],
        explanation: '',
        userAnswer,
        canAdvanceToBonus
      });

      setStats((prev) => ({
        correct: prev.correct + (isCorrect ? 1 : 0),
        total: prev.total + 1
      }));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to check answer');
    }
  }, [question, answer, scope, cycleContext]);

  const handleWasRight = useCallback(() => {
    if (!result || result.isCorrect || result.overriddenToCorrect) return;
    setResult((prev) => prev ? ({ ...prev, isCorrect: true, overriddenToCorrect: true }) : prev);
    setStats((prev) => ({ correct: prev.correct + 1, total: prev.total }));
    toast.success('Marked as correct');
  }, [result]);

  const handleWasWrong = useCallback(() => {
    if (!result || !result.isCorrect || result.overriddenToWrong) return;
    setResult((prev) => prev ? ({ ...prev, isCorrect: false, overriddenToWrong: true }) : prev);
    setStats((prev) => ({ correct: Math.max(0, prev.correct - 1), total: prev.total }));
    toast.success('Marked as incorrect');
  }, [result]);

  const handleAnswerInputChange = useCallback((e) => {
    const nextValue = e.target.value;
    setAnswer(nextValue);

    if (practiceMode !== 'reading' || result) return;

    const now = Date.now();
    const progress = String(nextValue || '').replace(/\s+/g, '').length;

    if (!typingStartedAt && progress > 0) {
      setTypingStartedAt(now);
      setLastProgressAt(now);
      setHardCapAt(now + TYPING_HARD_CAP_MS);
      setBestProgress(progress);
      return;
    }

    if (progress > bestProgress) {
      setBestProgress(progress);
      setLastProgressAt(now);
    }
  }, [practiceMode, result, typingStartedAt, bestProgress]);

  const handleReportQuestion = useCallback(async () => {
    const questionId = String(question?.id || '');
    if (!questionId || reportingQuestionId === questionId) return;

    try {
      setReportingQuestionId(questionId);
      const response = await questionAPI.report(questionId);
      const alreadyReported = Boolean(response?.data?.data?.alreadyReported);
      toast.success(alreadyReported ? 'Question already reported' : 'Question reported');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to report question');
    } finally {
      setReportingQuestionId('');
    }
  }, [question, reportingQuestionId]);

  const toggleCategory = (categoryId) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId) ? prev.filter((c) => c !== categoryId) : [...prev, categoryId]
    );
  };

  const updateDifficultyMin = (nextMin) => {
    const parsed = Number(nextMin);
    setDifficultyRange((prev) => {
      const clampedMin = Math.max(0, Math.min(parsed, 1));
      return { min: clampedMin, max: Math.max(clampedMin, prev.max) };
    });
  };

  const updateDifficultyMax = (nextMax) => {
    const parsed = Number(nextMax);
    setDifficultyRange((prev) => {
      const clampedMax = Math.max(0, Math.min(parsed, 1));
      return { min: Math.min(prev.min, clampedMax), max: clampedMax };
    });
  };

  // Reading mode: stream toss-up text word-by-word.
  useEffect(() => {
    if (!question?.questionText) {
      setDisplayedQuestionText('');
      return;
    }

    const shouldStream = practiceMode === 'reading' && question.type === 'tossup';
    if (!shouldStream) {
      setDisplayedQuestionText(question.questionText);
      return;
    }

    const words = String(question.questionText).split(/\s+/).filter(Boolean);
    const startAt = Date.now();

    const tick = () => {
      const elapsed = Math.max(0, Date.now() - startAt);
      const visibleWordCount = Math.min(words.length, Math.floor(elapsed / WORD_REVEAL_PACE_MS));
      setDisplayedQuestionText(words.slice(0, Math.max(1, visibleWordCount)).join(' '));
      return visibleWordCount >= words.length;
    };

    tick();
    const timer = setInterval(() => {
      if (tick()) clearInterval(timer);
    }, 50);
    return () => clearInterval(timer);
  }, [question, practiceMode]);

  // In reading mode, start countdown only after the read/reveal finishes.
  useEffect(() => {
    if (!question) return;
    const now = Date.now();
    if (practiceMode !== 'reading') {
      setTimerStartAt(now);
      return;
    }

    const questionWords = String(question.questionText || '').split(/\s+/).filter(Boolean).length;
    const questionReadMs = question.type === 'tossup'
      ? (questionWords * WORD_REVEAL_PACE_MS)
      : 0;

    let optionsReadMs = 0;
    if (question.type === 'tossup' && question.format === 'mc' && question.choices) {
      const keys = ['W', 'X', 'Y', 'Z'];
      const lastIndex = keys.length - 1;
      const lastChoiceWords = String(question.choices[keys[lastIndex]] || '').split(/\s+/).filter(Boolean).length;
      optionsReadMs = (lastIndex * MC_OPTION_STEP_MS) + MC_OPTION_PREFIX_PAUSE_MS + (lastChoiceWords * WORD_REVEAL_PACE_MS);
    }

    setTimerStartAt(now + questionReadMs + optionsReadMs);
  }, [question, practiceMode]);

  // Reading mode: reveal MC choices option-by-option at speaking pace.
  useEffect(() => {
    if (!question || question.format !== 'mc' || !question.choices) {
      setVisibleChoices({ W: '', X: '', Y: '', Z: '' });
      return;
    }

    const keys = ['W', 'X', 'Y', 'Z'];
    const shouldStreamOptions = practiceMode === 'reading' && question.type === 'tossup';
    if (!shouldStreamOptions) {
      setVisibleChoices({
        W: question.choices.W ? `W. ${question.choices.W}` : '',
        X: question.choices.X ? `X. ${question.choices.X}` : '',
        Y: question.choices.Y ? `Y. ${question.choices.Y}` : '',
        Z: question.choices.Z ? `Z. ${question.choices.Z}` : ''
      });
      return;
    }

    setVisibleChoices({ W: '', X: '', Y: '', Z: '' });
    const timers = [];
    keys.forEach((key, index) => {
      const text = String(question.choices[key] || '');
      const base = index * MC_OPTION_STEP_MS;
      timers.push(setTimeout(() => {
        setVisibleChoices((prev) => ({ ...prev, [key]: `${key}.` }));
      }, base));
      timers.push(setTimeout(() => {
        setVisibleChoices((prev) => ({ ...prev, [key]: text ? `${key}. ${text}` : `${key}.` }));
      }, base + MC_OPTION_PREFIX_PAUSE_MS));
    });

    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [question, practiceMode]);

  // Timer countdown.
  useEffect(() => {
    if (!question || result || loading) return;
    if (timeLeft === null || timeLeft <= 0) return;
    if (Date.now() < Number(timerStartAt || 0)) return;
    if (practiceMode === 'reading' && question.type === 'tossup' && typingStartedAt) return;
    const timer = setTimeout(() => {
      setTimeLeft((prev) => (prev === null ? prev : Math.max(prev - 1, 0)));
    }, 1000);
    return () => clearTimeout(timer);
  }, [question, result, loading, timeLeft, timerStartAt, practiceMode, typingStartedAt]);

  // Timer timeout.
  useEffect(() => {
    if (!question || result || loading) return;
    if (timeLeft !== 0) return;
    if (Date.now() < Number(timerStartAt || 0)) return;
    // In reading mode, toss-up with active typing is stall-controlled,
    // and bonus always transitions to a post-deadline stall window.
    if (practiceMode === 'reading') {
      if (question.type === 'tossup' && typingStartedAt) return;
      if (question.type === 'bonus') return;
    }
    setResult({
      isCorrect: false,
      correctAnswer: 'N/A (time expired)',
      userAnswer: answer || 'No answer',
      timedOut: true,
      canAdvanceToBonus: false,
      explanation: ''
    });
    setStats((prev) => ({ correct: prev.correct, total: prev.total + 1 }));
    toast.error('Time is up');
  }, [question, result, loading, timeLeft, answer, timerStartAt, practiceMode, typingStartedAt]);

  // Reading mode stall timer:
  // - toss-up: active after typing starts; freezes main timer
  // - bonus: active only after 20s main timer reaches 0
  useEffect(() => {
    if (!question || result || loading) return;
    if (practiceMode !== 'reading') {
      setStallSecondsLeft(STALL_TIMEOUT_SECONDS);
      return;
    }

    const tick = () => {
      const now = Date.now();
      const isBonus = question.type === 'bonus';

      let anchor = 0;
      if (isBonus) {
        if (Number(timeLeft || 0) > 0) {
          setStallSecondsLeft(STALL_TIMEOUT_SECONDS);
          return;
        }
        const bonusExpiredAt = Number(timerStartAt || 0) + 20000;
        anchor = Number(lastProgressAt || bonusExpiredAt || now);
      } else {
        if (!typingStartedAt) {
          setStallSecondsLeft(STALL_TIMEOUT_SECONDS);
          return;
        }
        anchor = Number(lastProgressAt || typingStartedAt || now);
      }

      const stallRemaining = Math.max(0, STALL_TIMEOUT_SECONDS - ((now - anchor) / 1000));
      setStallSecondsLeft(stallRemaining);

      const hitHardCap = Boolean(hardCapAt && now >= hardCapAt);
      if (stallRemaining <= 0 || hitHardCap) {
        setResult((prev) => {
          if (prev) return prev;
          setStats((current) => ({ correct: current.correct, total: current.total + 1 }));
          toast.error('Time is up');
          return {
            isCorrect: false,
            correctAnswer: 'N/A (time expired)',
            userAnswer: answer || 'No answer',
            timedOut: true,
            canAdvanceToBonus: false,
            explanation: ''
          };
        });
      }
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [
    question,
    result,
    loading,
    practiceMode,
    timeLeft,
    timerStartAt,
    typingStartedAt,
    lastProgressAt,
    hardCapAt,
    answer
  ]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (loading) return;
      if (!question) return;
      if (e.key !== 'Enter') return;

      if (result) {
        e.preventDefault();
        if (result.canAdvanceToBonus) {
          goToBonusInCycle();
        } else {
          fetchQuestion();
        }
        return;
      }

      if (!String(answer || '').trim()) return;
      e.preventDefault();
      handleSubmit();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, question, result, answer, handleSubmit, fetchQuestion, goToBonusInCycle]);

  const getCategoryColor = (id) => {
    const cat = categories.find((c) => c.id === id);
    return cat?.color || '#64748b';
  };

  const getCategoryName = (id) => {
    const cat = categories.find((c) => c.id === id);
    return cat?.name || id;
  };

  return (
    <div className={styles.practice}>
      <header className={styles.header}>
        <div>
          <h1>Practice Mode</h1>
          <p>{practiceMode === 'reading' ? 'Reading Mode: match-like timing' : 'Question Mode: focus on accuracy'}</p>
        </div>
        <div className={styles.sessionStats}>
          <span className={styles.statItem}>
            <span className={styles.statValue}>{stats.correct}</span>
            <span className={styles.statLabel}>Correct</span>
          </span>
          <span className={styles.statDivider}>/</span>
          <span className={styles.statItem}>
            <span className={styles.statValue}>{stats.total}</span>
            <span className={styles.statLabel}>Total</span>
          </span>
          {stats.total > 0 && (
            <span className={styles.accuracy}>{Math.round((stats.correct / stats.total) * 100)}%</span>
          )}
        </div>
      </header>

      <section className={styles.filters}>
        <div className={styles.filterGroup}>
          <label>Mode</label>
          <div className={styles.filterOptions}>
            <button
              className={`${styles.filterOption} ${practiceMode === 'question' ? styles.active : ''}`}
              onClick={() => setPracticeMode('question')}
            >
              Question Mode
            </button>
            <button
              className={`${styles.filterOption} ${practiceMode === 'reading' ? styles.active : ''}`}
              onClick={() => setPracticeMode('reading')}
            >
              Reading Mode
            </button>
          </div>
        </div>

        <div className={styles.filterGroup}>
          <label>Scope</label>
          <div className={styles.filterOptions}>
            {['tossup', 'bonus', 'cycle'].map((type) => (
              <button
                key={type}
                className={`${styles.filterOption} ${scope === type ? styles.active : ''}`}
                onClick={() => setScope(type)}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <label>Category</label>
          <div className={styles.filterOptions}>
            <button
              className={`${styles.filterOption} ${selectedCategories.length === 0 ? styles.active : ''}`}
              onClick={() => setSelectedCategories([])}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`${styles.filterOption} ${selectedCategories.includes(cat.id) ? styles.active : ''}`}
                onClick={() => toggleCategory(cat.id)}
                style={{ '--filter-color': cat.color }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <label>Difficulty</label>
          <div className={styles.difficultyRangeWrap}>
            <div className={styles.difficultyRangeSliders}>
              <div className={styles.rangeRow}>
                <span>Min</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={difficultyRange.min}
                  onChange={(e) => updateDifficultyMin(e.target.value)}
                  className={styles.timerSlider}
                />
                <span>{Number(difficultyRange.min).toFixed(2)}</span>
              </div>
              <div className={styles.rangeRow}>
                <span>Max</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={difficultyRange.max}
                  onChange={(e) => updateDifficultyMax(e.target.value)}
                  className={styles.timerSlider}
                />
                <span>{Number(difficultyRange.max).toFixed(2)}</span>
              </div>
            </div>
            <div className={styles.rangeSummary}>
              Showing questions with difficulty from {Number(difficultyRange.min).toFixed(2)} to {Number(difficultyRange.max).toFixed(2)}
            </div>
          </div>
        </div>

        <div className={styles.filterGroup}>
          <label>Timer</label>
          {practiceMode === 'question' && (
            <div className={styles.filterOptions}>
              <button
                className={`${styles.filterOption} ${!timerEnabled ? styles.active : ''}`}
                onClick={() => setTimerEnabled(false)}
              >
                Unlimited
              </button>
              <button
                className={`${styles.filterOption} ${timerEnabled ? styles.active : ''}`}
                onClick={() => setTimerEnabled(true)}
              >
                Timed
              </button>
            </div>
          )}
          {(practiceMode === 'reading' || timerEnabled) && (
            <div className={styles.timerSliderWrap}>
              <input
                type="range"
                min="1"
                max="60"
                step="1"
                value={timeLimitSeconds}
                onChange={(e) => setTimeLimitSeconds(Number(e.target.value))}
                className={styles.timerSlider}
                disabled={practiceMode === 'reading'}
              />
              <span className={styles.timerValue}>
                {practiceMode === 'reading'
                  ? (question?.type === 'bonus' ? '20s' : '2s')
                  : `${timeLimitSeconds}s`}
              </span>
            </div>
          )}
        </div>
      </section>

      <section className={styles.questionArea}>
        {loading ? (
          <Card className={styles.startCard}>
            <div className={styles.loadingSpinner}></div>
            <h2>Loading Question...</h2>
          </Card>
        ) : !question ? (
          <Card className={styles.startCard}>
            <FiFilter size={48} />
            <h2>Ready to Practice?</h2>
            <p>Select your filters and start practicing</p>
            <Button
              variant="primary"
              size="lg"
              onClick={fetchQuestion}
              loading={loading}
              icon={<FiRefreshCw />}
            >
              Get Question
            </Button>
          </Card>
        ) : (
          <Card className={styles.questionCard}>
            <div
              className={styles.categoryBadge}
              style={{ backgroundColor: getCategoryColor(question.category) }}
            >
              {getCategoryName(question.category)}
            </div>

            <span className={styles.difficultyBadge} data-difficulty={question.difficulty}>
              {question.difficulty}
            </span>

            <div
              className={styles.timerBadge}
              data-critical={timeLeft !== null && Number(timeLeft) <= 5}
            >
              <FiClock />
              <span>{timeLeft === null ? 'Unlimited' : `${timeLeft}s`}</span>
            </div>

            {practiceMode === 'reading' && !result && (
              <div
                className={styles.stallBadge}
                data-critical={Number(stallSecondsLeft || 0) <= 0.8}
              >
                Stall: {Number(stallSecondsLeft || STALL_TIMEOUT_SECONDS).toFixed(1)}s
              </div>
            )}

            <p className={styles.questionText}>
              {displayedQuestionText || question.questionText}
            </p>

            {question.format === 'mc' && question.choices && (
              <div className={styles.choices}>
                {Object.entries(question.choices).map(([letter]) => (
                  <div key={letter} className={styles.choiceLine}>
                    {visibleChoices[letter] || `${letter}. ...`}
                  </div>
                ))}
              </div>
            )}

            {!result && (
              <div className={styles.answerInput}>
                <input
                  type="text"
                  value={answer}
                  onChange={handleAnswerInputChange}
                  placeholder={question.format === 'mc' ? 'Type W/X/Y/Z or the exact option text...' : 'Type your answer...'}
                  autoFocus
                />
              </div>
            )}

            {result && (
              <div className={`${styles.result} ${result.isCorrect ? styles.correct : styles.incorrect}`}>
                {result.isCorrect ? (
                  <>
                    <FiCheck size={24} />
                    <span>
                      Correct! The answer is: <strong>{result.correctAnswer}</strong>
                    </span>
                  </>
                ) : (
                  <>
                    <FiX size={24} />
                    <span>
                      {result.timedOut ? 'Time expired.' : 'Incorrect.'} The answer is: <strong>{result.correctAnswer}</strong>
                    </span>
                  </>
                )}
              </div>
            )}

            <div className={styles.actionsRow}>
              {!result ? (
                <>
                  <div className={`${styles.actionsSlot} ${styles.leftSlot}`} />
                  <div className={`${styles.actionsSlot} ${styles.centerSlot}`}>
                    <Button
                      variant="success"
                      onClick={handleSubmit}
                      disabled={!String(answer || '').trim()}
                      icon={<FiCheck />}
                    >
                      Submit Answer
                    </Button>
                  </div>
                  <div className={`${styles.actionsSlot} ${styles.rightSlot}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleReportQuestion}
                      disabled={!question?.id || reportingQuestionId === String(question.id)}
                      icon={<FiFlag />}
                    >
                      {reportingQuestionId === String(question?.id || '') ? 'Reporting...' : 'Report Question'}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className={`${styles.actionsSlot} ${styles.leftSlot}`}>
                    {!result.isCorrect && (
                      <Button variant="secondary" onClick={handleWasRight}>
                        I Was Right
                      </Button>
                    )}
                    {result.isCorrect && (
                      <Button variant="secondary" onClick={handleWasWrong}>
                        I Was Wrong
                      </Button>
                    )}
                  </div>
                  <div className={`${styles.actionsSlot} ${styles.centerSlot}`}>
                    {result.canAdvanceToBonus ? (
                      <Button
                        variant="primary"
                        onClick={goToBonusInCycle}
                        icon={<FiRefreshCw />}
                      >
                        Go To Bonus
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={fetchQuestion}
                        loading={loading}
                        icon={<FiRefreshCw />}
                      >
                        Next Question
                      </Button>
                    )}
                  </div>
                  <div className={`${styles.actionsSlot} ${styles.rightSlot}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleReportQuestion}
                      disabled={!question?.id || reportingQuestionId === String(question.id)}
                      icon={<FiFlag />}
                    >
                      {reportingQuestionId === String(question?.id || '') ? 'Reporting...' : 'Report Question'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        )}
      </section>
    </div>
  );
};

export default Practice;
