import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { gameAPI } from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { FiClock, FiZap, FiCheck, FiX, FiHome, FiRepeat, FiArrowLeft } from 'react-icons/fi';
import Button from '../components/Button';
import toast from 'react-hot-toast';
import styles from './Game.module.css';
const Game = () => {
  const {
    gameCode
  } = useParams();
  const {
    user
  } = useAuth();
  const {
    socket,
    isConnected
  } = useSocket();
  const navigate = useNavigate();
  const answerInputRef = useRef(null);
  const startTimeoutRef = useRef(null);
  const hasInitialized = useRef(false);
  const hasReceivedStartRef = useRef(false);
  const activeRoundIdRef = useRef(null);
  const activeQuestionRef = useRef(0);
  const phaseRef = useRef('loading');
  const maxProgressRef = useRef(0);
  const opponentMaxProgressRef = useRef(0);
  const readUnlockTimerRef = useRef(null);
  const answerWindowStartedAtRef = useRef(null);
  const opponentAnswerWindowStartedAtRef = useRef(null);
  const [gameState, setGameState] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [question, setQuestion] = useState(null);
  const [displayedQuestionText, setDisplayedQuestionText] = useState('');
  const [visibleChoices, setVisibleChoices] = useState({
    W: '',
    X: '',
    Y: '',
    Z: ''
  });
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [gameId, setGameId] = useState(null);
  const [currentGameType, setCurrentGameType] = useState(null);
  const [score, setScore] = useState({
    player1: 0,
    player2: 0
  });
  const [myPosition, setMyPosition] = useState(null);
  const [opponent, setOpponent] = useState(null);
  const [canBuzz, setCanBuzz] = useState(false);
  const [hasBuzzed, setBuzzed] = useState(false);
  const [buzzer, setBuzzer] = useState(null);
  const [eligibleBuzzer, setEligibleBuzzer] = useState(null);
  const [answer, setAnswer] = useState('');
  const [hasStartedTyping, setHasStartedTyping] = useState(false);
  const [lastTypingAt, setLastTypingAt] = useState(null);
  const [stallSecondsLeft, setStallSecondsLeft] = useState(null);
  const [opponentStartedTyping, setOpponentStartedTyping] = useState(false);
  const [opponentLastTypingAt, setOpponentLastTypingAt] = useState(null);
  const [opponentStallSecondsLeft, setOpponentStallSecondsLeft] = useState(null);
  const [opponentLiveAnswer, setOpponentLiveAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [lastResult, setLastResult] = useState(null);
  const [protestState, setProtestState] = useState(null);
  const [isSubmittingProtest, setIsSubmittingProtest] = useState(false);
  const [protestAdjustState, setProtestAdjustState] = useState(null);
  const [showProtestAdjustModal, setShowProtestAdjustModal] = useState(false);
  const [myAdjustDelta, setMyAdjustDelta] = useState(0);
  const [opponentAdjustDelta, setOpponentAdjustDelta] = useState(0);
  const [nextCountdown, setNextCountdown] = useState(null);
  const [isNextCountdownPaused, setIsNextCountdownPaused] = useState(false);
  const [nextReadyPlayers, setNextReadyPlayers] = useState([]);
  const [isReadyForNext, setIsReadyForNext] = useState(false);
  const [protestStatusMessage, setProtestStatusMessage] = useState('');
  const [protestClockNow, setProtestClockNow] = useState(Date.now());
  const [bonusWarningSeconds, setBonusWarningSeconds] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [countdown, setCountdown] = useState(null);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const redirectToGameError = useCallback((reason = 'invalid', message = '') => {
    if (message) toast.error(message);
    const safeReason = encodeURIComponent(reason);
    const safeCode = encodeURIComponent(gameCode || '');
    navigate(`/game-error?reason=${safeReason}&gameCode=${safeCode}`, {
      replace: true
    });
  }, [navigate, gameCode]);
  const handleBuzz = useCallback(() => {
    if (!canBuzz || hasBuzzed || !socket) return;
    setBuzzed(true);
    setCanBuzz(false);
    socket.emit('game:buzz', {
      gameCode
    });
  }, [canBuzz, hasBuzzed, socket, gameCode]);
  const emitInputActivity = useCallback((progress = 0, text = '') => {
    if (!socket) return;
    socket.emit('game:inputActivity', {
      gameCode,
      progress,
      text
    });
  }, [socket, gameCode]);
  const handleSubmitAnswer = useCallback(() => {
    if (!socket) return;
    if (phase !== 'answering') return;
    const finalAnswer = answer;
    socket.emit('game:answer', {
      gameCode,
      answer: finalAnswer || ''
    });
    setPhase('waiting_result');
  }, [answer, socket, gameCode, phase]);
  const handleLeaveGame = useCallback(() => {
    if (socket) {
      socket.emit('game:leave', {
        gameCode,
        intentionalForfeit: true
      });
    }
    navigate('/play');
  }, [socket, gameCode, navigate]);
  const handleStartProtestAdjust = useCallback(() => {
    if (!socket || isSubmittingProtest) return;
    if (!protestAdjustState || protestAdjustState.phase !== 'window') return;
    setProtestAdjustState(current => current ? {
      ...current,
      phase: 'selecting',
      selector: myPosition,
      selectionEndsAt: Date.now() + 10000
    } : current);
    setShowProtestAdjustModal(true);
    setIsSubmittingProtest(true);
    socket.emit('game:protestAdjust:start', {
      gameCode
    });
  }, [socket, protestAdjustState, gameCode, isSubmittingProtest, myPosition]);
  const handleOpenProtest = useCallback(() => {
    if (!protestAdjustState) return;
    if (protestAdjustState.phase === 'window') {
      handleStartProtestAdjust();
      return;
    }
    if (['selecting', 'awaiting_response'].includes(String(protestAdjustState.phase || ''))) {
      setShowProtestAdjustModal(true);
    }
  }, [protestAdjustState, handleStartProtestAdjust]);
  const handleSubmitProtestAdjust = useCallback(() => {
    if (!socket || isSubmittingProtest) return;
    if (!protestAdjustState || protestAdjustState.phase !== 'selecting') return;
    if (protestAdjustState.selector !== myPosition) return;
    const liveAllowedPairs = Array.isArray(protestAdjustState.allowedPairs) ? protestAdjustState.allowedPairs : [];
    if (liveAllowedPairs.length > 0) {
      const pairIsAllowed = liveAllowedPairs.some(pair => Number(pair?.myDelta) === Number(myAdjustDelta) && Number(pair?.opponentDelta) === Number(opponentAdjustDelta));
      if (!pairIsAllowed) return;
    }
    setIsSubmittingProtest(true);
    socket.emit('game:protestAdjust:submit', {
      gameCode,
      myDelta: Number(myAdjustDelta),
      opponentDelta: Number(opponentAdjustDelta)
    });
  }, [socket, protestAdjustState, myPosition, myAdjustDelta, opponentAdjustDelta, gameCode, isSubmittingProtest]);
  const handleRespondProtestAdjust = useCallback(decision => {
    if (!socket || isSubmittingProtest) return;
    if (!protestAdjustState || protestAdjustState.phase !== 'awaiting_response') return;
    if (String(protestAdjustState.awaitingResponder || '') !== String(myPosition || '')) return;
    setIsSubmittingProtest(true);
    socket.emit('game:protestAdjust:respond', {
      gameCode,
      decision
    });
  }, [socket, protestAdjustState, myPosition, gameCode, isSubmittingProtest]);
  const handleCancelProtestAdjust = useCallback(() => {
    if (!socket || isSubmittingProtest) return;
    if (!protestAdjustState) return;
    const phaseName = String(protestAdjustState.phase || '');
    const canCancelAsSelector = phaseName === 'selecting' && String(protestAdjustState.selector || '') === String(myPosition || '');
    const canCancelAsProposer = phaseName === 'awaiting_response' && String(protestAdjustState.proposer || '') === String(myPosition || '');
    if (!canCancelAsSelector && !canCancelAsProposer) return;
    setIsSubmittingProtest(true);
    socket.emit('game:protestAdjust:cancel', {
      gameCode
    });
  }, [socket, isSubmittingProtest, protestAdjustState, myPosition, gameCode]);
  const handleReadyForNext = useCallback(() => {
    if (!socket || phase !== 'review' || !lastResult?.questionClosed || isReadyForNext) return;
    setIsReadyForNext(true);
    socket.emit('game:nextReady', {
      gameCode
    });
  }, [socket, phase, lastResult, isReadyForNext, gameCode]);
  useEffect(() => {
    if (readUnlockTimerRef.current) {
      clearTimeout(readUnlockTimerRef.current);
      readUnlockTimerRef.current = null;
    }
    if (!socket) return;
    const handleCreated = data => {
      console.log('[Socket] Game created event received:', data);
    };
    const handleStart = data => {
      console.log('[Socket] Game start event received:', data);
      if (hasReceivedStartRef.current) return;
      hasReceivedStartRef.current = true;
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
      setTotalQuestions(data.totalQuestions || 10);
      activeQuestionRef.current = 0;
      activeRoundIdRef.current = null;
      setProtestState(null);
      setPhase('countdown');
      setCountdown(3);
    };
    const handlePlayerJoined = data => {
      console.log('[Socket] Player joined event received:', data);
    };
    const handleQuestion = data => {
      console.log('[Socket] Question received:', data.questionNumber);
      if (readUnlockTimerRef.current) {
        clearTimeout(readUnlockTimerRef.current);
        readUnlockTimerRef.current = null;
      }
      hasReceivedStartRef.current = true;
      activeQuestionRef.current = data.questionNumber;
      activeRoundIdRef.current = data.roundId ?? null;
      setQuestion(data.question);
      setDisplayedQuestionText('');
      setVisibleChoices({
        W: '',
        X: '',
        Y: '',
        Z: ''
      });
      setQuestionNumber(data.questionNumber);
      setScore(data.score);
      setLastResult(null);
      setProtestState(null);
      setIsSubmittingProtest(false);
      setProtestAdjustState(null);
      setShowProtestAdjustModal(false);
      setMyAdjustDelta(0);
      setOpponentAdjustDelta(0);
      setNextCountdown(null);
      setIsNextCountdownPaused(false);
      setNextReadyPlayers([]);
      setIsReadyForNext(false);
      setProtestStatusMessage('');
      setPhase('buzzing');
      setCanBuzz(false);
      setBuzzed(false);
      setBuzzer(null);
      setEligibleBuzzer(data.restartFor || null);
      setAnswer('');
      setHasStartedTyping(false);
      setLastTypingAt(null);
      setStallSecondsLeft(null);
      setOpponentStartedTyping(false);
      setOpponentLastTypingAt(null);
      setOpponentStallSecondsLeft(null);
      setOpponentLiveAnswer('');
      maxProgressRef.current = 0;
      opponentMaxProgressRef.current = 0;
      answerWindowStartedAtRef.current = null;
      opponentAnswerWindowStartedAtRef.current = null;
      setBonusWarningSeconds(null);
      setTimeLeft(0);
      const now = Date.now();
      const fullReadEndsAt = Number(data.question?.fullReadEndsAt || data.question?.readEndsAt || 0);
      const buzzStartsAt = Number(data.buzzStartsAt || fullReadEndsAt || 0);
      const buzzEndsAt = Number(data.buzzEndsAt || (buzzStartsAt ? buzzStartsAt + 5000 : 0));
      const bonusEndsAt = Number(data.bonusEndsAt || 0);
      if (data.question?.questionKind === 'bonus') {
        setPhase(data.question?.bonusForTeam === myPosition ? 'answering' : 'waiting_answer');
        const setBonusTimer = () => {
          const remaining = bonusEndsAt > 0 ? Math.max(0, Math.ceil((bonusEndsAt - Date.now()) / 1000)) : Number(data.bonusTimeLimitSeconds || 20);
          setTimeLeft(remaining);
        };
        const bonusStartsAt = Number(data.bonusStartsAt || fullReadEndsAt || 0);
        if (bonusStartsAt > now) {
          readUnlockTimerRef.current = setTimeout(() => {
            if (activeRoundIdRef.current !== (data.roundId ?? null)) return;
            if (!['answering', 'waiting_answer'].includes(phaseRef.current)) return;
            setBonusTimer();
          }, bonusStartsAt - now);
        } else {
          setBonusTimer();
        }
        if (data.question?.bonusForTeam === myPosition) {
          setTimeout(() => answerInputRef.current?.focus(), 100);
        }
      } else {
        setMyPosition(currentPosition => {
          const isEligible = !data.restartFor || data.restartFor === currentPosition;
          setCanBuzz(isEligible);
          return currentPosition;
        });
        const setBuzzTimer = () => {
          const remaining = buzzEndsAt > 0 ? Math.max(0, Math.ceil((buzzEndsAt - Date.now()) / 1000)) : 5;
          setTimeLeft(remaining);
        };
        if (buzzStartsAt > now) {
          readUnlockTimerRef.current = setTimeout(() => {
            if (activeRoundIdRef.current !== (data.roundId ?? null)) return;
            if (phaseRef.current !== 'buzzing') return;
            setBuzzTimer();
          }, buzzStartsAt - now);
        } else {
          setBuzzTimer();
        }
      }
    };
    const handleBuzzed = data => {
      console.log('[Socket] Buzzed event received:', data);
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) {
        return;
      }
      setBuzzer(data.playerId);
      setCanBuzz(false);
      setTimeLeft(Number(data.answerWindowSeconds ?? 2));
      answerWindowStartedAtRef.current = Date.now();
      opponentAnswerWindowStartedAtRef.current = answerWindowStartedAtRef.current;
      setHasStartedTyping(false);
      setLastTypingAt(null);
      setStallSecondsLeft(null);
      setOpponentStartedTyping(false);
      setOpponentLastTypingAt(null);
      setOpponentStallSecondsLeft(null);
      setOpponentLiveAnswer('');
      maxProgressRef.current = 0;
      opponentMaxProgressRef.current = 0;
      setMyPosition(currentPosition => {
        if (data.playerId === currentPosition) {
          setPhase('answering');
          setTimeout(() => answerInputRef.current?.focus(), 100);
        } else {
          setPhase('waiting_answer');
        }
        return currentPosition;
      });
    };
    const handleAnswerResult = data => {
      console.log('[Socket] Answer result received:', data);
      if (!['answering', 'waiting_answer', 'waiting_result'].includes(phaseRef.current)) return;
      if (data.questionNumber && data.questionNumber !== activeQuestionRef.current) return;
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;
      setLastResult({
        ...data,
        questionClosed: false
      });
      setScore(data.score);
      setPhase('review');
      setBonusWarningSeconds(null);
      setIsSubmittingProtest(false);
      setHasStartedTyping(false);
      setLastTypingAt(null);
      setStallSecondsLeft(null);
      setOpponentStartedTyping(false);
      setOpponentLastTypingAt(null);
      setOpponentStallSecondsLeft(null);
      setOpponentLiveAnswer('');
      maxProgressRef.current = 0;
      opponentMaxProgressRef.current = 0;
      answerWindowStartedAtRef.current = null;
      opponentAnswerWindowStartedAtRef.current = null;
      if (data.allowProtest) {
        setProtestState(current => current || {
          roundId: data.roundId,
          questionNumber: data.questionNumber,
          canProtest: true,
          status: 'open',
          targetPlayerId: data.protestTargetPlayerId || data.playerId || null,
          protestedBy: [],
          actions: [],
          claims: {
            player1: {
              ownAnswerAccepted: false,
              opponentAnswerRejected: false
            },
            player2: {
              ownAnswerAccepted: false,
              opponentAnswerRejected: false
            }
          }
        });
      }
    };
    const handleProtestState = data => {
      if (data.questionNumber && data.questionNumber !== activeQuestionRef.current) return;
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;
      setProtestState(data);
      setIsSubmittingProtest(false);
    };
    const handleProtestResolved = data => {
      if (data.questionNumber && data.questionNumber !== activeQuestionRef.current) return;
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;
      setProtestState(current => ({
        ...(current || {}),
        ...data,
        status: 'resolved'
      }));
      if (data.score) setScore(data.score);
      setIsSubmittingProtest(false);
    };
    const handleQuestionClosed = data => {
      if (data.questionNumber && data.questionNumber !== activeQuestionRef.current) return;
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;
      setScore(data.score);
      setLastResult(current => current ? {
        ...current,
        correctAnswer: data.correctAnswer,
        protestResolution: data.protestResolution || current.protestResolution,
        questionClosed: true
      } : current);
      setNextCountdown(data.nextCountdown ?? 15);
      setIsNextCountdownPaused(Boolean(data.nextCountdownPaused));
      setProtestAdjustState(data.protestAdjust || null);
      setShowProtestAdjustModal(false);
      setMyAdjustDelta(0);
      setOpponentAdjustDelta(0);
      setNextReadyPlayers(data.readyPlayers || []);
      setProtestStatusMessage(String(data.protestStatusMessage || ''));
      if (myPosition) {
        setIsReadyForNext(Boolean((data.readyPlayers || []).includes(myPosition)));
      }
    };
    const handleProtestAdjustState = data => {
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;
      setProtestAdjustState(data || null);
      if (data?.score) setScore(data.score);
      setIsSubmittingProtest(false);
      if (data?.phase === 'selecting' || data?.phase === 'awaiting_response') {
        setShowProtestAdjustModal(true);
      }
      if (data?.phase === 'closed' || data?.phase === 'applied' || data?.phase === 'pending_ai') {
        setShowProtestAdjustModal(false);
      }
    };
    const handleNextReadyState = data => {
      if (data.questionNumber && data.questionNumber !== activeQuestionRef.current) return;
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;
      setNextReadyPlayers(data.readyPlayers || []);
      if (typeof data.secondsLeft === 'number') {
        setNextCountdown(Math.max(0, data.secondsLeft));
      }
      setIsNextCountdownPaused(Boolean(data.paused));
      if (typeof data.protestStatusMessage === 'string') {
        setProtestStatusMessage(data.protestStatusMessage);
      }
      if (myPosition) {
        setIsReadyForNext(Boolean((data.readyPlayers || []).includes(myPosition)));
      }
    };
    const handleBonusWarning = data => {
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;
      if (phaseRef.current !== 'answering') return;
      setBonusWarningSeconds(data.secondsLeft || 5);
    };
    const handleAnswerActivity = data => {
      if (!data) return;
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;
      const progress = Number(data.progress || 0);
      if (data.playerId === myPosition) {
        setHasStartedTyping(previous => previous || progress > 0);
        if (data.progressChanged) {
          maxProgressRef.current = Math.max(maxProgressRef.current, progress);
          setLastTypingAt(Number(data.lastProgressAt || Date.now()));
        }
      } else {
        setOpponentStartedTyping(previous => previous || progress > 0);
        setOpponentLiveAnswer(String(data.text || ''));
        if (data.progressChanged) {
          opponentMaxProgressRef.current = Math.max(opponentMaxProgressRef.current, progress);
          setOpponentLastTypingAt(Number(data.lastProgressAt || Date.now()));
        }
      }
    };
    const handleSecondChance = data => {
      console.log('[Socket] Second chance buzz window:', data);
      if (readUnlockTimerRef.current) {
        clearTimeout(readUnlockTimerRef.current);
        readUnlockTimerRef.current = null;
      }
      if (data.questionNumber && data.questionNumber !== activeQuestionRef.current) return;
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;
      setPhase('buzzing');
      setBuzzer(null);
      setEligibleBuzzer(data.eligiblePlayerId || null);
      setProtestState(null);
      setAnswer('');
      setHasStartedTyping(false);
      setLastTypingAt(null);
      setStallSecondsLeft(null);
      setOpponentStartedTyping(false);
      setOpponentLastTypingAt(null);
      setOpponentStallSecondsLeft(null);
      setOpponentLiveAnswer('');
      maxProgressRef.current = 0;
      opponentMaxProgressRef.current = 0;
      answerWindowStartedAtRef.current = null;
      opponentAnswerWindowStartedAtRef.current = null;
      setTimeLeft(0);
      setMyPosition(currentPosition => {
        const isEligible = !data.eligiblePlayerId || data.eligiblePlayerId === currentPosition;
        const now = Date.now();
        const buzzStartsAt = Number(data.buzzStartsAt || 0);
        const buzzEndsAt = Number(data.buzzEndsAt || 0);
        const applyWindow = () => {
          const remaining = buzzEndsAt > 0 ? Math.max(0, Math.ceil((buzzEndsAt - Date.now()) / 1000)) : Math.ceil((data.buzzWindowTime ?? 5000) / 1000);
          setTimeLeft(remaining);
          setCanBuzz(isEligible);
        };
        if (buzzStartsAt > now) {
          setCanBuzz(isEligible);
          if (readUnlockTimerRef.current) clearTimeout(readUnlockTimerRef.current);
          readUnlockTimerRef.current = setTimeout(() => {
            if (activeRoundIdRef.current !== (data.roundId ?? null)) return;
            if (phaseRef.current !== 'buzzing') return;
            applyWindow();
          }, buzzStartsAt - now);
        } else {
          applyWindow();
        }
        return currentPosition;
      });
    };
    const handleNoBuzz = data => {
      console.log('[Socket] No buzz - time expired:', data);
      if (phaseRef.current !== 'buzzing') return;
      if (data.questionNumber && data.questionNumber !== activeQuestionRef.current) return;
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;
      setLastResult({
        noBuzz: true,
        correctAnswer: data.correctAnswer,
        questionOver: Boolean(data.questionOver),
        allowProtest: Boolean(data.allowProtest),
        questionClosed: false
      });
      setScore(data.score);
      setPhase('review');
      setBonusWarningSeconds(null);
      setIsSubmittingProtest(false);
      setHasStartedTyping(false);
      setLastTypingAt(null);
      setStallSecondsLeft(null);
      setOpponentStartedTyping(false);
      setOpponentLastTypingAt(null);
      setOpponentStallSecondsLeft(null);
      setOpponentLiveAnswer('');
      maxProgressRef.current = 0;
      opponentMaxProgressRef.current = 0;
      answerWindowStartedAtRef.current = null;
      opponentAnswerWindowStartedAtRef.current = null;
      if (data.questionOver && data.allowProtest) {
        setProtestState(current => current || {
          roundId: data.roundId,
          questionNumber: data.questionNumber,
          canProtest: true,
          status: 'open',
          targetPlayerId: null,
          protestedBy: [],
          actions: [],
          claims: {
            player1: {
              ownAnswerAccepted: false,
              opponentAnswerRejected: false
            },
            player2: {
              ownAnswerAccepted: false,
              opponentAnswerRejected: false
            }
          }
        });
      }
    };
    const handleEnd = data => {
      console.log('[Socket] Game end received:', data);
      if (data.gameId) setGameId(data.gameId);
      setGameResult(data);
      setPhase('complete');
    };
    const handlePlayerLeft = data => {
      console.log('[Socket] Player left received:', data);
      if (data.forfeit) {
        toast.success('Your opponent left. You win!');
        const currentPosition = myPosition || 'player1';
        setGameResult({
          winner: currentPosition,
          forfeit: true
        });
        setPhase('complete');
      } else {
        toast('Opponent disconnected. Game is still running.');
      }
    };
    const handleConnectionState = data => {
      if (!data || !data.playerId) return;
      if (data.playerId === myPosition) return;
      if (data.connected) {
        toast.success('Opponent reconnected');
      } else {
        toast('Opponent disconnected. Game continues.');
      }
    };
    const handleError = data => {
      console.error('[Socket] Game error:', data);
      setIsSubmittingProtest(false);
      if (phase === 'waiting_result' && String(data?.code || '').startsWith('ANSWER_REJECTED_')) {
        const recoverPhase = data?.recoverPhase;
        if (recoverPhase === 'review' || recoverPhase === 'buzzing' || recoverPhase === 'waiting_answer') {
          setPhase(recoverPhase);
        } else {
          setPhase('answering');
        }
      }
      const normalized = String(data?.message || '').toLowerCase();
      const isNotFound = normalized.includes('game not found');
      const isExpired = normalized.includes('expired') || normalized.includes('cancelled') || normalized.includes('abandoned');
      if (isNotFound && myPosition === 'player2' && !hasReceivedStartRef.current) {
        return;
      }
      if (isNotFound || isExpired) {
        redirectToGameError(isExpired ? 'expired' : 'invalid', data.message || 'Game is unavailable');
        return;
      }
      toast.error(data.message || 'Game error');
    };
    socket.on('game:created', handleCreated);
    socket.on('game:start', handleStart);
    socket.on('game:playerJoined', handlePlayerJoined);
    socket.on('game:question', handleQuestion);
    socket.on('game:buzzed', handleBuzzed);
    socket.on('game:answerResult', handleAnswerResult);
    socket.on('game:protestState', handleProtestState);
    socket.on('game:protestResolved', handleProtestResolved);
    socket.on('game:questionClosed', handleQuestionClosed);
    socket.on('game:protestAdjustState', handleProtestAdjustState);
    socket.on('game:nextReadyState', handleNextReadyState);
    socket.on('game:bonusWarning', handleBonusWarning);
    socket.on('game:answerActivity', handleAnswerActivity);
    socket.on('game:secondChance', handleSecondChance);
    socket.on('game:noBuzz', handleNoBuzz);
    socket.on('game:end', handleEnd);
    socket.on('game:playerLeft', handlePlayerLeft);
    socket.on('game:connectionState', handleConnectionState);
    socket.on('game:error', handleError);
    console.log('[Socket] All event handlers registered');
    return () => {
      socket.off('game:created', handleCreated);
      socket.off('game:start', handleStart);
      socket.off('game:playerJoined', handlePlayerJoined);
      socket.off('game:question', handleQuestion);
      socket.off('game:buzzed', handleBuzzed);
      socket.off('game:answerResult', handleAnswerResult);
      socket.off('game:protestState', handleProtestState);
      socket.off('game:protestResolved', handleProtestResolved);
      socket.off('game:questionClosed', handleQuestionClosed);
      socket.off('game:protestAdjustState', handleProtestAdjustState);
      socket.off('game:nextReadyState', handleNextReadyState);
      socket.off('game:bonusWarning', handleBonusWarning);
      socket.off('game:answerActivity', handleAnswerActivity);
      socket.off('game:secondChance', handleSecondChance);
      socket.off('game:noBuzz', handleNoBuzz);
      socket.off('game:end', handleEnd);
      socket.off('game:playerLeft', handlePlayerLeft);
      socket.off('game:connectionState', handleConnectionState);
      socket.off('game:error', handleError);
      console.log('[Socket] All event handlers removed');
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
      }
      if (readUnlockTimerRef.current) {
        clearTimeout(readUnlockTimerRef.current);
        readUnlockTimerRef.current = null;
      }
    };
  }, [socket, redirectToGameError, myPosition]);
  useEffect(() => {
    if (!question?.questionText) {
      setDisplayedQuestionText('');
      return;
    }
    const isTossup = question?.questionKind === 'tossup';
    const shouldStream = (isTossup ? phase === 'buzzing' : ['answering', 'waiting_answer'].includes(phase)) && Number(question?.wordPaceMs || 0) > 0 && Number(question?.readStartedAt || 0) > 0;
    if (!shouldStream) {
      if (!displayedQuestionText) {
        setDisplayedQuestionText(question.questionText);
      }
      return;
    }
    const words = String(question.questionText).split(/\s+/).filter(Boolean);
    const startAt = Number(question.readStartedAt);
    const pace = Number(question.wordPaceMs || 320);
    const tick = () => {
      const elapsed = Math.max(0, Date.now() - startAt);
      const visibleWordCount = Math.min(words.length, Math.floor(elapsed / pace));
      const nextText = words.slice(0, Math.max(1, visibleWordCount)).join(' ');
      setDisplayedQuestionText(nextText);
      if (visibleWordCount >= words.length) return true;
      return false;
    };
    tick();
    const timer = setInterval(() => {
      const done = tick();
      if (done) clearInterval(timer);
    }, 50);
    return () => clearInterval(timer);
  }, [question, phase]);
  useEffect(() => {
    if (!question || question.format !== 'mc' || !question.choices) {
      setVisibleChoices({
        W: '',
        X: '',
        Y: '',
        Z: ''
      });
      return;
    }
    const keys = ['W', 'X', 'Y', 'Z'];
    const shouldProgressiveReveal = question.revealChoicesAfterRead && Number(question.readEndsAt || 0) > 0;
    if (!shouldProgressiveReveal) {
      setVisibleChoices({
        W: question.choices.W ? `W. ${question.choices.W}` : '',
        X: question.choices.X ? `X. ${question.choices.X}` : '',
        Y: question.choices.Y ? `Y. ${question.choices.Y}` : '',
        Z: question.choices.Z ? `Z. ${question.choices.Z}` : ''
      });
      return;
    }
    const canRevealInPhase = question.questionKind === 'tossup' ? phase === 'buzzing' : ['answering', 'waiting_answer'].includes(phase);
    if (!canRevealInPhase) return;
    setVisibleChoices({
      W: '',
      X: '',
      Y: '',
      Z: ''
    });
    const readEndsAt = Number(question.readEndsAt);
    const prefixPauseMs = Number(question.mcOptionPrefixPauseMs || 280);
    const interOptionPauseMs = Number(question.mcOptionInterOptionPauseMs || 220);
    const optionWordPaceMs = Number(question.mcOptionWordPaceMs || question.wordPaceMs || 320);
    const startDelayMs = Math.max(0, readEndsAt - Date.now());
    const timers = [];
    let cursorMs = startDelayMs;
    keys.forEach((key, index) => {
      const optionText = String(question.choices[key] || '').trim();
      const optionWords = optionText.split(/\s+/).filter(Boolean);
      timers.push(setTimeout(() => {
        setVisibleChoices(prev => ({
          ...prev,
          [key]: `${key}.`
        }));
      }, cursorMs));
      cursorMs += prefixPauseMs;
      optionWords.forEach((_, wordIndex) => {
        timers.push(setTimeout(() => {
          const partial = optionWords.slice(0, wordIndex + 1).join(' ');
          setVisibleChoices(prev => ({
            ...prev,
            [key]: `${key}. ${partial}`
          }));
        }, cursorMs));
        cursorMs += optionWordPaceMs;
      });
      if (index < keys.length - 1) {
        cursorMs += interOptionPauseMs;
      }
    });
    return () => timers.forEach(timer => clearTimeout(timer));
  }, [question, phase]);
  useEffect(() => {
    if (phase !== 'review' || !lastResult?.questionClosed || isNextCountdownPaused) return;
    if (nextCountdown === null || nextCountdown <= 0) return;
    const timer = setTimeout(() => {
      setNextCountdown(prev => prev === null ? prev : Math.max(prev - 1, 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [phase, lastResult, nextCountdown, isNextCountdownPaused]);
  useEffect(() => {
    const isPostQuestionReview = phase === 'review' && Boolean(lastResult?.questionClosed);
    const protestPhase = String(protestAdjustState?.phase || '');
    const hasActiveProtestTimer = ['window', 'selecting', 'awaiting_response'].includes(protestPhase);
    if (!isPostQuestionReview || !hasActiveProtestTimer) return;
    const timer = setInterval(() => {
      setProtestClockNow(Date.now());
    }, 200);
    return () => clearInterval(timer);
  }, [phase, lastResult, protestAdjustState?.phase, protestAdjustState?.windowEndsAt, protestAdjustState?.selectionEndsAt, protestAdjustState?.responseEndsAt]);
  useEffect(() => {
    if (hasInitialized.current) return;
    const initGame = async () => {
      try {
        const response = await gameAPI.getByCode(gameCode);
        const game = response.data?.data?.game ?? response.data?.game;
        if (!game) {
          console.error('[Game Init] Game not found in response:', response.data);
          redirectToGameError('invalid', 'Game not found');
          return;
        }
        console.log('[Game Init] Game loaded:', {
          gameCode: game.gameCode,
          gameType: game.gameType,
          status: game.status,
          player1: game.player1?.userId,
          player2: game.player2 ? {
            isAI: game.player2.isAI,
            difficulty: game.player2.aiDifficulty
          } : null,
          user: user?.id
        });
        const userId = String(user?.id ?? '');
        const isPlayer1 = String(game.player1?.userId ?? '') === userId;
        const isAIGame = Boolean(game.player2?.isAI);
        const position = isAIGame ? 'player1' : isPlayer1 ? 'player1' : 'player2';
        console.log('[Game Init] Game analysis:', {
          isPlayer1,
          isAIGame,
          myPosition: position
        });
        setMyPosition(position);
        setOpponent(isPlayer1 ? game.player2 : game.player1);
        setGameId(game._id || game.id || null);
        setCurrentGameType(game.gameType || null);
        if (['cancelled', 'abandoned'].includes(game.status)) {
          redirectToGameError('expired', 'This game has expired');
          return;
        }
        if (game.status === 'completed') {
          setGameResult({
            winner: game.winner,
            score: game.score
          });
          setPhase('complete');
          return;
        }
        hasInitialized.current = true;
        const setupTimeout = (timeoutMs = 15000) => {
          if (hasReceivedStartRef.current) return;
          if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
          startTimeoutRef.current = setTimeout(() => {
            if (hasReceivedStartRef.current) return;
            console.error('[Game] Timeout waiting for game:start');
            toast.error('Game failed to start. Please try again.');
            navigate('/play');
          }, timeoutMs);
        };
        if (isAIGame) {
          console.log('[AI Game] Creating AI game room:', gameCode);
          socket.emit('game:create', {
            gameCode,
            gameType: game.gameType ?? 'ai'
          });
          setPhase(currentPhase => hasReceivedStartRef.current ? currentPhase : 'connecting');
          setupTimeout(10000);
          return;
        }
        const autoStartTypes = ['ranked', 'unranked_1v1'];
        const initialPhase = autoStartTypes.includes(game.gameType) ? 'connecting' : 'waiting';
        if (isPlayer1) {
          console.log('[Multiplayer] Player 1 creating game room:', gameCode);
          socket.emit('game:create', {
            gameCode,
            gameType: game.gameType
          });
          setPhase(currentPhase => hasReceivedStartRef.current ? currentPhase : initialPhase);
          if (autoStartTypes.includes(game.gameType)) setupTimeout(15000);
        } else {
          console.log('[Multiplayer] Player 2 joining game room:', gameCode);
          socket.emit('game:join', {
            gameCode
          });
          setPhase(currentPhase => hasReceivedStartRef.current ? currentPhase : initialPhase);
          if (autoStartTypes.includes(game.gameType)) setupTimeout(15000);
        }
      } catch (err) {
        hasInitialized.current = false;
        console.error('[Game Init] Error:', err);
        const status = err?.response?.status;
        const rawMessage = String(err?.response?.data?.error || err?.message || '').toLowerCase();
        const isInvalid = status === 404 || rawMessage.includes('not found');
        const isExpired = rawMessage.includes('expired') || rawMessage.includes('cancelled') || rawMessage.includes('abandoned');
        if (isInvalid || isExpired) {
          redirectToGameError(isExpired ? 'expired' : 'invalid', isExpired ? 'This game has expired' : 'Invalid game link');
          return;
        }
        toast.error('Failed to load game');
        navigate('/play');
      }
    };
    if (!user) {
      console.log('[Game Init] Waiting for user...');
      return;
    }
    if (!socket || !isConnected) {
      console.log('[Game Init] Waiting for socket connection...');
      return;
    }
    hasInitialized.current = true;
    console.log('[Game Init] Starting initialization for game:', gameCode);
    initGame();
  }, [gameCode, user, socket, isConnected, navigate, redirectToGameError]);
  useEffect(() => {
    const canRetryPhase = phase === 'waiting' || phase === 'connecting';
    if (!canRetryPhase || myPosition !== 'player2' || !gameCode || !socket || hasReceivedStartRef.current) return;
    const interval = setInterval(() => {
      socket.emit('game:join', {
        gameCode
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [phase, myPosition, gameCode, socket]);
  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      setCountdown(null);
    }
  }, [countdown]);
  useEffect(() => {
    const isTimedPhase = phase === 'buzzing' || phase === 'answering' || phase === 'waiting_answer';
    if (!isTimedPhase || timeLeft <= 0) return;
    const isBonusQuestion = question?.questionKind === 'bonus';
    const readEndsAt = Number(question?.fullReadEndsAt || question?.readEndsAt || 0);
    if (phase === 'buzzing' && readEndsAt > Date.now()) return;
    if ((phase === 'answering' || phase === 'waiting_answer') && isBonusQuestion && readEndsAt > Date.now()) return;
    if (!isBonusQuestion && phase === 'answering' && hasStartedTyping) return;
    if (!isBonusQuestion && phase === 'waiting_answer' && opponentStartedTyping) return;
    const timer = setTimeout(() => {
      setTimeLeft(prev => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, phase, hasStartedTyping, opponentStartedTyping, question]);
  useEffect(() => {
    if (phase !== 'answering') {
      setStallSecondsLeft(null);
      return;
    }
    const isBonusQuestion = question?.questionKind === 'bonus';
    const timer = setInterval(() => {
      if (isBonusQuestion && Number(timeLeft || 0) > 0) {
        answerWindowStartedAtRef.current = null;
        setStallSecondsLeft(2);
        return;
      }
      if (isBonusQuestion && !answerWindowStartedAtRef.current) {
        answerWindowStartedAtRef.current = Date.now();
      }
      const windowStartedAt = Number(answerWindowStartedAtRef.current || Date.now());
      const anchor = hasStartedTyping ? Math.max(Number(lastTypingAt || 0), windowStartedAt) : windowStartedAt;
      const idleMs = Math.max(0, Date.now() - anchor);
      const remaining = Math.max(0, (2000 - idleMs) / 1000);
      setStallSecondsLeft(Number(remaining.toFixed(1)));
    }, 120);
    return () => clearInterval(timer);
  }, [phase, hasStartedTyping, lastTypingAt, question, timeLeft]);
  useEffect(() => {
    if (phase !== 'waiting_answer') {
      setOpponentStallSecondsLeft(null);
      return;
    }
    const isBonusQuestion = question?.questionKind === 'bonus';
    const timer = setInterval(() => {
      if (isBonusQuestion && Number(timeLeft || 0) > 0) {
        opponentAnswerWindowStartedAtRef.current = null;
        setOpponentStallSecondsLeft(2);
        return;
      }
      if (isBonusQuestion && !opponentAnswerWindowStartedAtRef.current) {
        opponentAnswerWindowStartedAtRef.current = Date.now();
      }
      const windowStartedAt = Number(opponentAnswerWindowStartedAtRef.current || Date.now());
      const anchor = opponentStartedTyping ? Math.max(Number(opponentLastTypingAt || 0), windowStartedAt) : windowStartedAt;
      const idleMs = Math.max(0, Date.now() - anchor);
      const remaining = Math.max(0, (2000 - idleMs) / 1000);
      setOpponentStallSecondsLeft(Number(remaining.toFixed(1)));
    }, 120);
    return () => clearInterval(timer);
  }, [phase, opponentStartedTyping, opponentLastTypingAt, question, timeLeft]);
  useEffect(() => {
    const handleKeyDown = e => {
      if (phase === 'buzzing' && e.code === 'Space') {
        e.preventDefault();
        handleBuzz();
      }
      if (phase === 'answering' && e.code === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmitAnswer();
      }
      if (phase === 'review' && lastResult?.questionClosed && e.code === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleReadyForNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, lastResult, handleBuzz, handleSubmitAnswer, handleReadyForNext]);
  const getCategoryColor = category => {
    const colors = {
      biology: '#22c55e',
      chemistry: '#f59e0b',
      physics: '#3b82f6',
      math: '#8b5cf6',
      earthScience: '#10b981',
      astronomy: '#6366f1',
      energy: '#eab308',
      computerScience: '#06b6d4'
    };
    return colors[category] || '#64748b';
  };
  const getCategoryName = category => {
    const names = {
      biology: 'Biology',
      chemistry: 'Chemistry',
      physics: 'Physics',
      math: 'Mathematics',
      earthScience: 'Earth Science',
      astronomy: 'Astronomy',
      energy: 'Energy',
      computerScience: 'Computer Science'
    };
    return names[category] || category;
  };
  const isEligibleForCurrentWindow = !eligibleBuzzer || eligibleBuzzer === myPosition;
  const isBuzzDisabled = !canBuzz || hasBuzzed || !isEligibleForCurrentWindow;
  const isAIOpponent = Boolean(opponent?.isAI);
  const getPlayerDisplayNameById = useCallback(playerId => {
    if (playerId === 'player1') return myPosition === 'player1' ? user?.username || 'Player 1' : opponent?.username || 'Player 1';
    if (playerId === 'player2') return myPosition === 'player2' ? user?.username || 'Player 2' : opponent?.username || (isAIOpponent ? 'AI' : 'Player 2');
    return playerId || 'Unknown';
  }, [myPosition, opponent, user, isAIOpponent]);
  const effectiveProtestState = protestState || null;
  const canShowCorrectAnswer = Boolean(lastResult?.correctAnswer && (lastResult?.isCorrect || lastResult?.questionClosed));
  const waitingForNextQuestion = Boolean(phase === 'review' && lastResult?.questionClosed);
  const protestAdjustSecondsLeft = (() => {
    if (!protestAdjustState) return 0;
    const nowMs = Number(protestClockNow || Date.now());
    if (protestAdjustState.phase === 'window' && protestAdjustState.windowEndsAt) {
      return Math.max(0, Math.ceil((protestAdjustState.windowEndsAt - nowMs) / 1000));
    }
    if (protestAdjustState.phase === 'selecting' && protestAdjustState.selectionEndsAt) {
      return Math.max(0, Math.ceil((protestAdjustState.selectionEndsAt - nowMs) / 1000));
    }
    if (protestAdjustState.phase === 'awaiting_response' && protestAdjustState.responseEndsAt) {
      return Math.max(0, Math.ceil((protestAdjustState.responseEndsAt - nowMs) / 1000));
    }
    return 0;
  })();
  const protesterNames = effectiveProtestState?.protestedByNames && effectiveProtestState.protestedByNames.length > 0 ? effectiveProtestState.protestedByNames : (effectiveProtestState?.protestedBy || []).map(getPlayerDisplayNameById);
  const canOpenProtest = Boolean(waitingForNextQuestion && protestAdjustState);
  const protestButtonLabel = (() => {
    if (!protestAdjustState) return 'Protest';
    if (protestAdjustState.phase === 'window') return `Protest (${protestAdjustSecondsLeft}s)`;
    if (protestAdjustState.phase === 'selecting') return 'Protest: Selecting';
    if (protestAdjustState.phase === 'awaiting_response') return 'Protest: Awaiting Response';
    if (protestAdjustState.phase === 'pending_ai') return 'Protest: Pending AI';
    if (protestAdjustState.phase === 'applied') return 'Protest: Resolved';
    if (protestAdjustState.phase === 'closed') return 'Protest Closed';
    return 'Protest';
  })();
  const isProtestButtonDisabled = Boolean(!protestAdjustState || isSubmittingProtest || ['pending_ai', 'applied', 'closed'].includes(String(protestAdjustState.phase || '')));
  const selectingPlayerName = getPlayerDisplayNameById(protestAdjustState?.selector || '');
  const awaitingResponderName = getPlayerDisplayNameById(protestAdjustState?.awaitingResponder || '');
  const readyCount = nextReadyPlayers.length;
  const requiredReadyCount = isAIOpponent ? 1 : 2;
  const protestOfficialAnswer = useMemo(() => {
    if (!lastResult?.correctAnswer) return '';
    if (question?.format === 'mc' && question?.choices) {
      const letter = String(lastResult.correctAnswer || '').trim().toUpperCase();
      const optionText = question.choices?.[letter];
      if (optionText) return `${letter}. ${optionText}`;
    }
    return String(lastResult.correctAnswer);
  }, [lastResult?.correctAnswer, question?.format, question?.choices]);
  const protestAllowedPairs = useMemo(() => {
    if (Array.isArray(protestAdjustState?.allowedPairs) && protestAdjustState.allowedPairs.length > 0) {
      return protestAdjustState.allowedPairs.map(pair => ({
        myDelta: Number(pair?.myDelta),
        opponentDelta: Number(pair?.opponentDelta)
      })).filter(pair => Number.isFinite(pair.myDelta) && Number.isFinite(pair.opponentDelta));
    }
    const fallbackDeltas = Array.isArray(protestAdjustState?.allowedDeltas) ? protestAdjustState.allowedDeltas.map(value => Number(value)).filter(value => Number.isFinite(value)) : [-4, 0, 4];
    return fallbackDeltas.flatMap(myDelta => fallbackDeltas.map(opponentDelta => ({
      myDelta,
      opponentDelta
    })));
  }, [protestAdjustState?.allowedPairs, protestAdjustState?.allowedDeltas]);
  const myAdjustOptions = useMemo(() => Array.from(new Set(protestAllowedPairs.map(pair => Number(pair.myDelta)))), [protestAllowedPairs]);
  const opponentAdjustOptions = useMemo(() => Array.from(new Set(protestAllowedPairs.filter(pair => Number(pair.myDelta) === Number(myAdjustDelta)).map(pair => Number(pair.opponentDelta)))), [protestAllowedPairs, myAdjustDelta]);
  const isSelectedProtestPairValid = protestAllowedPairs.some(pair => Number(pair.myDelta) === Number(myAdjustDelta) && Number(pair.opponentDelta) === Number(opponentAdjustDelta));
  useEffect(() => {
    if (protestAllowedPairs.length === 0) return;
    if (isSelectedProtestPairValid) return;
    const fallback = protestAllowedPairs[0];
    setMyAdjustDelta(Number(fallback.myDelta));
    setOpponentAdjustDelta(Number(fallback.opponentDelta));
  }, [protestAllowedPairs, isSelectedProtestPairValid]);
  if (phase === 'loading' || phase === 'connecting') {
    return <div className={styles.gameContainer}>
        <div className={styles.loadingScreen}>
          {}
          <div className={styles.spinner}></div>

          {}
          <p className={styles.loadingText}>
            {phase === 'connecting' ? 'Starting game...' : !isConnected ? 'Connecting to server...' : 'Loading game...'}
          </p>

          {}
          {!user && <p className={styles.loadingSubtext}>Checking authentication...</p>}

          {}
          {phase === 'connecting' && <Button variant="secondary" icon={<FiArrowLeft />} onClick={() => navigate('/play')} className={styles.goBackButton}>

              Cancel
            </Button>}
        </div>
      </div>;
  }
  if (phase === 'waiting') {
    return <div className={styles.gameContainer}>
        <div className={styles.waitingScreen}>
          {}
          <div className={styles.waitingAnimation}>
            <div className={styles.waitingDot}></div>
            <div className={styles.waitingDot}></div>
            <div className={styles.waitingDot}></div>
          </div>

          <h2>Waiting for opponent...</h2>

          {}
          <p className={styles.gameCodeDisplay}>
            Game Code: <strong>{gameCode}</strong>
          </p>

          {}
          <Button variant="secondary" icon={<FiArrowLeft />} onClick={handleLeaveGame} className={styles.goBackButton}>
            Go back
          </Button>
        </div>
      </div>;
  }
  if (phase === 'opponent_left') {
    return <div className={styles.gameContainer}>
        <div className={styles.waitingScreen}>
          <h2>Opponent left the game</h2>
          <p>The other player has disconnected or left.</p>
          <Button variant="primary" icon={<FiHome />} onClick={() => navigate('/play')}>
            Back to Play
          </Button>
        </div>
      </div>;
  }
  if (phase === 'countdown' || countdown !== null) {
    return <div className={styles.gameContainer}>
        <div className={styles.countdownScreen}>
          <motion.div key={countdown} initial={{
          scale: 0.5,
          opacity: 0
        }} animate={{
          scale: 1,
          opacity: 1
        }} exit={{
          scale: 1.5,
          opacity: 0
        }} className={styles.countdownNumber}>

            {countdown || 'GO!'}
          </motion.div>
        </div>
      </div>;
  }
  if (phase === 'complete' && gameResult) {
    const finalPlayer1Score = gameResult.finalScore?.player1 ?? score.player1 ?? 0;
    const finalPlayer2Score = gameResult.finalScore?.player2 ?? score.player2 ?? 0;
    const inferredWinner = gameResult.winner || (finalPlayer1Score === finalPlayer2Score ? 'tie' : finalPlayer1Score > finalPlayer2Score ? 'player1' : 'player2');
    const oneVOneReplayPath = String(currentGameType || '') === 'ranked' ? '/play?mode=ranked&autoQueue=1' : String(currentGameType || '') === 'unranked_1v1' ? '/play?mode=unranked&autoQueue=1' : '/play';
    const isWinner = inferredWinner === myPosition;
    const isTie = inferredWinner === 'tie';
    return <div className={styles.gameContainer}>
        <div className={styles.resultScreen}>
          <motion.div initial={{
          scale: 0.8,
          opacity: 0
        }} animate={{
          scale: 1,
          opacity: 1
        }} className={`${styles.resultCard} ${isWinner ? styles.win : isTie ? styles.tie : styles.lose}`}>

            {}
            <div className={styles.resultIcon}>
              {isWinner ? '🏆' : isTie ? '🤝' : '💪'}
            </div>

            {}
            <h1 className={styles.resultTitle}>
              {isWinner ? 'Victory!' : isTie ? 'Tie Game!' : 'Defeat'}
            </h1>

            {}
            <div className={styles.finalScore}>
              <span className={myPosition === 'player1' ? styles.myScore : ''}>
                {finalPlayer1Score}
              </span>
              <span className={styles.scoreDivider}>-</span>
              <span className={myPosition === 'player2' ? styles.myScore : ''}>
                {finalPlayer2Score}
              </span>
            </div>

            {}
            {gameResult.ratingChanges && <div className={`${styles.ratingChange} ${(myPosition === 'player1' ? gameResult.ratingChanges.player1Change : gameResult.ratingChanges.player2Change) > 0 ? styles.positive : styles.negative}`}>
                {(myPosition === 'player1' ? gameResult.ratingChanges.player1Change : gameResult.ratingChanges.player2Change) > 0 ? '+' : ''}
                {myPosition === 'player1' ? gameResult.ratingChanges.player1Change : gameResult.ratingChanges.player2Change} Rating
              </div>}

            {}
              <div className={styles.resultActions}>
              <Button variant="primary" icon={<FiRepeat />} onClick={() => navigate(oneVOneReplayPath)}>
                Play Again
              </Button>
              <Button variant="secondary" onClick={() => navigate(`/games/${gameResult.gameId || gameId}/review`)} disabled={!gameResult.gameId && !gameId}>

                Game Review
              </Button>
              <Button variant="secondary" onClick={() => navigate('/dashboard')}>
                Dashboard
              </Button>
            </div>
          </motion.div>
        </div>
      </div>;
  }
  return <div className={styles.gameContainer}>
      {['buzzing', 'answering', 'waiting_answer', 'waiting_result', 'review'].includes(phase) && <div className={styles.topLeftAction}>
          <Button variant="danger" onClick={handleLeaveGame}>
            Forfeit Match
          </Button>
          <div className={styles.topLeftCounter}>
            {questionNumber}/{totalQuestions}
          </div>
        </div>}

      {}
      {}
      {}
      <header className={styles.header}>
        {}
        <div className={styles.questionProgress}>
          Question {questionNumber} of {totalQuestions}
        </div>

        {}
        <div className={styles.scoreBoard}>
          {}
          <div className={`${styles.playerScore} ${myPosition === 'player1' ? styles.me : ''}`}>
            <span className={styles.playerName}>
              {myPosition === 'player1' ? 'You' : opponent?.username || 'Opponent'}
            </span>
            <span className={styles.scoreValue}>{score.player1}</span>
          </div>

          <span className={styles.vs}>vs</span>

          {}
          <div className={`${styles.playerScore} ${myPosition === 'player2' ? styles.me : ''}`}>
            <span className={styles.scoreValue}>{score.player2}</span>
            <span className={styles.playerName}>
              {myPosition === 'player2' ? 'You' : opponent?.username || 'AI'}
            </span>
          </div>
        </div>
      </header>

      {}
      {}
      {}
      <main className={styles.main}>
        {}
        <AnimatePresence mode="wait">
          {question && <motion.div key={questionNumber} initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} exit={{
          opacity: 0,
          y: -20
        }} className={styles.questionCard}>

              {}
              <div className={styles.categoryBadge} style={{
            backgroundColor: getCategoryColor(question.category)
          }}>

                {getCategoryName(question.category)}
              </div>

              {}
              <p className={styles.questionText}>{displayedQuestionText || question.questionText}</p>

              {}
              {question.format === 'mc' && question.choices && <div className={styles.choicesGrid}>
                  {Object.entries(question.choices).map(([letter]) => <div key={letter} className={`${styles.choiceLine} ${phase === 'review' && lastResult?.correctAnswer?.toUpperCase() === letter ? styles.correct : ''}`}>

                      <span className={styles.choiceText}>{visibleChoices[letter] || `${letter}. ...`}</span>
                    </div>)}
                </div>}

              {}
              {phase === 'answering' && <div className={styles.answerInput}>
                  <input ref={answerInputRef} type="text" value={answer} onChange={e => {
              const nextValue = e.target.value;
              setAnswer(nextValue);
              const nextProgress = nextValue.replace(/\s/g, '').length;
              setHasStartedTyping(previous => previous || nextProgress > 0);
              if (nextProgress > maxProgressRef.current) {
                maxProgressRef.current = nextProgress;
                setLastTypingAt(Date.now());
              }
              emitInputActivity(nextProgress, nextValue);
            }} placeholder="Type your answer..." autoFocus />

                </div>}
            </motion.div>}
        </AnimatePresence>

        {}
        {phase === 'review' && lastResult && <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} className={styles.reviewOverlay}>

            <div className={`${styles.reviewCard} ${lastResult.isCorrect ? styles.correct : styles.incorrect}`}>
              {}
              {lastResult.noBuzz ? <>
                  <FiClock size={48} />
                  <h3>Time's Up!</h3>
                </> : lastResult.isCorrect ? <>
                  <FiCheck size={48} />
                  <h3>Correct!</h3>
                </> : <>
                  <FiX size={48} />
                  <h3>Incorrect</h3>
                </>}

              {}
              {canShowCorrectAnswer && <p className={styles.correctAnswer}>
                  Answer: <strong>{lastResult.correctAnswer}</strong>
                </p>}

              {}
              {!lastResult.noBuzz && <p className={styles.correctAnswer}>
                  {lastResult.playerId === myPosition ? 'Your answer' : `${isAIOpponent ? 'AI' : opponent?.username || 'Opponent'} answer`}:
                  {' '}
                  <strong>{lastResult.answer || 'No answer'}</strong>
                </p>}

              {(lastResult?.resultTag === 'interrupt' || lastResult?.resultTag === 'interrupt_no_penalty') && !lastResult?.isCorrect && !lastResult?.noBuzz && <p className={styles.correctAnswer}>
                  Interrupt penalty: <strong>{lastResult?.resultTag === 'interrupt_no_penalty' ? '0' : '-4'}</strong>
                </p>}

              {waitingForNextQuestion && <div className={styles.nextQuestionPanel}>
                  {Boolean(protestStatusMessage) && <p className={styles.correctAnswer}>
                      {protestStatusMessage}
                    </p>}

                  {protesterNames.length > 0 && <p className={styles.correctAnswer}>
                      Protested by: {protesterNames.join(', ')}
                    </p>}

                  <p className={styles.correctAnswer}>
                    Next question in <strong>{nextCountdown ?? 15}s</strong>
                    {isNextCountdownPaused ? ' (paused for protest)' : ''}
                  </p>
                  <p className={styles.correctAnswer}>
                    Ready: <strong>{readyCount}/{requiredReadyCount}</strong>
                  </p>
                  <div className={styles.nextActionRow}>
                    <Button variant={isReadyForNext ? 'secondary' : 'primary'} onClick={handleReadyForNext} disabled={isReadyForNext}>

                      {isReadyForNext ? 'Ready' : 'Ready For Next'}
                    </Button>
                    {canOpenProtest && <Button variant="secondary" onClick={handleOpenProtest} disabled={isProtestButtonDisabled}>

                        {protestButtonLabel}
                      </Button>}
                  </div>
                </div>}

              {waitingForNextQuestion && showProtestAdjustModal && protestAdjustState && ['selecting', 'awaiting_response'].includes(protestAdjustState.phase) && <div className={styles.protestModalBackdrop}>
                  <div className={styles.protestModal}>
                    <div className={styles.protestHeaderRow}>
                      <span className={styles.protestBadge}>
                        {protestAdjustState.phase === 'selecting' ? protestAdjustState.selector === myPosition ? 'Choose Score Adjustment' : 'Opponent Filing / Countering' : protestAdjustState.phase === 'awaiting_response' ? protestAdjustState.awaitingResponder === myPosition ? 'Respond to Protest' : 'Waiting for Opponent Decision' : 'AI Adjudication Pending'}
                      </span>
                      <span className={styles.protestCountdownPill}>{protestAdjustSecondsLeft}s</span>
                    </div>

                    <div className={styles.protestSnapshot}>
                      <p className={styles.protestSnapshotLabel}>Question</p>
                      <p className={styles.protestSnapshotText}>{question?.questionText || displayedQuestionText || 'N/A'}</p>
                      {question?.format === 'mc' && question?.choices && <div className={styles.protestSnapshotChoices}>
                          {['W', 'X', 'Y', 'Z'].map(letter => <p key={`protest-choice-${letter}`} className={styles.protestSnapshotChoice}>
                              <strong>{letter}.</strong> {question.choices?.[letter] || '...'}
                            </p>)}
                        </div>}
                      <p className={styles.protestSnapshotAnswer}>
                        Official answer: <strong>{protestOfficialAnswer || 'N/A'}</strong>
                      </p>
                    </div>

                    {protestAdjustState.phase === 'selecting' && protestAdjustState.selector === myPosition ? <>
                        <div className={styles.protestActions}>
                          <label className={styles.adjustField}>
                            <span>You</span>
                            <select className={styles.adjustSelect} value={myAdjustDelta} onChange={e => {
                      const nextMyDelta = Number(e.target.value);
                      setMyAdjustDelta(nextMyDelta);
                      const nextOpponentOptions = protestAllowedPairs.filter(pair => Number(pair.myDelta) === nextMyDelta).map(pair => Number(pair.opponentDelta));
                      if (!nextOpponentOptions.includes(Number(opponentAdjustDelta)) && nextOpponentOptions.length > 0) {
                        setOpponentAdjustDelta(nextOpponentOptions[0]);
                      }
                    }}>

                              {myAdjustOptions.map(delta => <option key={`my-${delta}`} value={delta}>
                                  {delta > 0 ? `+${delta}` : `${delta}`}
                                </option>)}
                            </select>
                          </label>
                          <label className={styles.adjustField}>
                            <span>Opponent</span>
                            <select className={styles.adjustSelect} value={opponentAdjustDelta} onChange={e => setOpponentAdjustDelta(Number(e.target.value))}>
                              {opponentAdjustOptions.map(delta => <option key={`opp-${delta}`} value={delta}>
                                  {delta > 0 ? `+${delta}` : `${delta}`}
                                </option>)}
                            </select>
                          </label>
                        </div>
                        <Button variant="primary" onClick={handleSubmitProtestAdjust} disabled={isSubmittingProtest || !isSelectedProtestPairValid}>

                          Submit Adjustment
                        </Button>
                        <Button variant="secondary" onClick={handleCancelProtestAdjust} disabled={isSubmittingProtest}>

                          Cancel Protest
                        </Button>
                      </> : protestAdjustState.phase === 'awaiting_response' && protestAdjustState.awaitingResponder === myPosition ? <>
                        <p className={styles.correctAnswer}>
                          Proposed change: You {Number(protestAdjustState.proposal?.[myPosition === 'player1' ? 'player1Delta' : 'player2Delta'] || 0) >= 0 ? '+' : ''}{Number(protestAdjustState.proposal?.[myPosition === 'player1' ? 'player1Delta' : 'player2Delta'] || 0)}
                          {' '} / Opponent {Number(protestAdjustState.proposal?.[myPosition === 'player1' ? 'player2Delta' : 'player1Delta'] || 0) >= 0 ? '+' : ''}{Number(protestAdjustState.proposal?.[myPosition === 'player1' ? 'player2Delta' : 'player1Delta'] || 0)}
                        </p>
                        <div className={styles.nextActionRow}>
                          <Button variant="success" onClick={() => handleRespondProtestAdjust('accept')} disabled={isSubmittingProtest}>
                            Accept
                          </Button>
                          <Button variant="danger" onClick={() => handleRespondProtestAdjust('reject')} disabled={isSubmittingProtest}>
                            Reject (Send to AI)
                          </Button>
                          <Button variant="secondary" onClick={() => handleRespondProtestAdjust('counter')} disabled={isSubmittingProtest}>
                            Counter
                          </Button>
                        </div>
                      </> : protestAdjustState.phase === 'pending_ai' ? <p className={styles.correctAnswer}>
                        Protest escalated. AI will decide asynchronously; verdict appears in game review.
                      </p> : <>
                        <p className={styles.correctAnswer}>
                          {protestAdjustState.phase === 'selecting' ? `${selectingPlayerName || 'Opponent'} is choosing score adjustments. You will respond once they submit.` : protestAdjustState.phase === 'awaiting_response' ? `${awaitingResponderName || 'Opponent'} is deciding: accept, reject to AI, or counter.` : 'Waiting for opponent selection...'}
                        </p>
                        {protestAdjustState.phase === 'awaiting_response' && protestAdjustState.proposer === myPosition && <Button variant="secondary" onClick={handleCancelProtestAdjust} disabled={isSubmittingProtest}>

                            Cancel Protest
                          </Button>}
                      </>}
                  </div>
                </div>}
            </div>
          </motion.div>}
      </main>

      {}
      {}
      {}
      <footer className={styles.footer}>
        {}
        {(phase === 'buzzing' || phase === 'answering' || phase === 'waiting_answer') && Number(timeLeft || 0) > 0 && <div className={`${styles.timer} ${question?.questionKind === 'bonus' && Number(timeLeft || 0) <= 5 ? styles.timerCritical : ''}`}>
            <FiClock />
            <span>{timeLeft}s</span>
          </div>}
        {phase === 'answering' && <div className={styles.waitingIndicator}>
            Stall timer: {Number(stallSecondsLeft ?? 2).toFixed(1)}s
          </div>}

        {}
        {phase === 'buzzing' && <button className={`${styles.buzzButton} ${isBuzzDisabled ? styles.disabled : ''}`} onClick={handleBuzz} disabled={isBuzzDisabled}>

            <FiZap size={24} />
            <span>BUZZ!</span>
            <span className={styles.buzzHint}>(Press Space)</span>
          </button>}

        {}
        {phase === 'answering' && <Button variant="success" size="lg" onClick={handleSubmitAnswer} icon={<FiCheck />}>

            Submit Answer
          </Button>}

        {}
        {phase === 'waiting_answer' && <div className={styles.waitingIndicator}>
            {`Opponent is answering... Stall timer: ${Number(opponentStallSecondsLeft ?? 2).toFixed(1)}s`}
            {` | Typed: ${opponentLiveAnswer || '...'}`}
          </div>}

      </footer>
    </div>;
};
export default Game;
