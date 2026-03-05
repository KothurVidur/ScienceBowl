/**
 * ============================================================================
 * GAME.JSX - THE MAIN REAL-TIME GAME COMPONENT
 * ============================================================================
 * 
 * This is the heart of the Science Bowl game experience. It handles:
 * - Real-time WebSocket communication for live gameplay
 * - Game state management (questions, scores, timers)
 * - Player interactions (buzzing, answering)
 * - Multiple game phases (loading, waiting, playing, results)
 * 
 * COMPONENT ARCHITECTURE:
 * This is a "smart" or "container" component - it manages complex state
 * and business logic. In larger apps, you might split this into:
 * - GameContainer (logic) + GameUI (presentation)
 * But for this size, keeping them together is cleaner.
 * 
 * REAL-TIME COMMUNICATION:
 * Unlike traditional HTTP (request → response), this component uses
 * WebSockets via Socket.io for bidirectional, real-time communication:
 * - Server can push events to client (new question, opponent buzzed)
 * - Client can send events to server (buzz, submit answer)
 * - Both happen instantly without page refreshes
 * 
 * GAME FLOW:
 * 1. Component mounts → Load game from API → Initialize socket room
 * 2. Wait for opponent (multiplayer) or start immediately (AI)
 * 3. Countdown → First question
 * 4. For each cycle:
 *    - Read question → 5s buzz window (after reading) → answer window
 *    - Show result → Next question or end game
 * 5. Show final results with rating changes
 * 
 * ============================================================================
 */

/**
 * REACT HOOKS IMPORTS
 * 
 * useState: Store component state (question, score, phase, etc.)
 * useEffect: Handle side effects (socket events, timers, API calls)
 * useCallback: Memoize functions to prevent unnecessary re-renders
 * useRef: Store mutable values that don't trigger re-renders (timers, flags)
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * REACT ROUTER HOOKS
 * 
 * useParams: Extract URL parameters (gameCode from /game/:gameCode)
 * useNavigate: Programmatic navigation (redirect after game ends)
 */
import { useParams, useNavigate } from 'react-router-dom';

/**
 * CONTEXT HOOKS
 * 
 * useAuth: Access current user info (id, username)
 * useSocket: Access WebSocket connection (socket instance, connection status)
 */
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

/**
 * API SERVICE
 * 
 * gameAPI: HTTP client for game-related endpoints
 * Used to fetch initial game data before starting real-time play
 */
import { gameAPI } from '../services/api';

/**
 * FRAMER MOTION - Animation Library
 * 
 * motion: Wrapper that adds animation capabilities to any element
 * AnimatePresence: Enables exit animations when components unmount
 * 
 * Why animations matter in games:
 * - Visual feedback makes the game feel responsive
 * - Transitions help players understand state changes
 * - Polish makes the app feel professional
 */
import { motion, AnimatePresence } from 'framer-motion';

/**
 * REACT ICONS
 * 
 * Icon components from Feather Icons set.
 * Fi prefix = Feather Icons
 * 
 * Using SVG icons (vs image files):
 * - Scalable without quality loss
 * - Can be styled with CSS (color, size)
 * - Smaller bundle size
 * - Tree-shakeable (only icons used are included)
 */
import { FiClock, FiZap, FiCheck, FiX, FiHome, FiRepeat, FiArrowLeft } from 'react-icons/fi';

/**
 * LOCAL COMPONENTS AND UTILITIES
 */
import Button from '../components/Button';  // Reusable styled button
import toast from 'react-hot-toast';        // Toast notifications for feedback
import styles from './Game.module.css';     // CSS Modules for scoped styling

/**
 * ============================================================================
 * GAME COMPONENT
 * ============================================================================
 */
const Game = () => {
  /**
   * ===========================================================================
   * HOOKS AND REFS
   * ===========================================================================
   */
  
  /**
   * URL PARAMETERS
   * 
   * useParams() extracts dynamic segments from the URL.
   * For route /game/:gameCode, visiting /game/ABC123 gives { gameCode: 'ABC123' }
   */
  const { gameCode } = useParams();
  
  /**
   * AUTH CONTEXT
   * 
   * Get the current logged-in user's information.
   * Used to determine if this user is player1 or player2.
   */
  const { user } = useAuth();
  
  /**
   * SOCKET CONTEXT
   * 
   * socket: The Socket.io client instance for emitting/receiving events
   * isConnected: Boolean indicating if we're connected to the server
   * 
   * We use the raw socket here (instead of emit/on helpers) for better
   * control over event registration timing.
   */
  const { socket, isConnected } = useSocket();
  
  /**
   * NAVIGATION
   * 
   * Programmatic navigation function.
   * navigate('/play') redirects the user to the play page.
   */
  const navigate = useNavigate();
  
  /**
   * REFS
   * 
   * useRef creates a mutable object { current: value } that persists
   * across renders but doesn't cause re-renders when changed.
   * 
   * Use cases:
   * - DOM element references (answerInputRef → focus the input)
   * - Timer IDs (startTimeoutRef → clear timeout later)
   * - Mutable flags (hasInitialized → prevent double initialization)
   */
  const answerInputRef = useRef(null);      // Reference to answer input for auto-focus
  const startTimeoutRef = useRef(null);      // Timeout ID for game start timeout
  const hasInitialized = useRef(false);      // Flag to prevent React StrictMode double-init
  const hasReceivedStartRef = useRef(false); // Prevent duplicate start-phase transitions
  const activeRoundIdRef = useRef(null);     // Current authoritative round ID from server
  const activeQuestionRef = useRef(0);       // Current authoritative question number from server
  const phaseRef = useRef('loading');        // Live phase ref for stable socket handlers
  const maxProgressRef = useRef(0);
  const opponentMaxProgressRef = useRef(0);
  const readUnlockTimerRef = useRef(null);
  const answerWindowStartedAtRef = useRef(null);
  const opponentAnswerWindowStartedAtRef = useRef(null);

  /**
   * ===========================================================================
   * STATE DECLARATIONS
   * ===========================================================================
   * 
   * STATE ORGANIZATION:
   * Group related state together for readability.
   * Consider: Could some of these be combined into a reducer?
   * For this complexity level, individual useState is fine.
   */
  
  // -------------------------------------------------------------------------
  // GAME STATE - Core game information
  // -------------------------------------------------------------------------
  
  /**
   * gameState: Full game state object (rarely used directly now)
   */
  const [gameState, setGameState] = useState(null);
  
  /**
   * phase: Current phase of the game UI
   * 
   * PHASE FLOW:
   * loading → connecting → waiting → countdown → buzzing ↔ answering → review → complete
   *                                      ↑__________________________________|
   * 
   * Phases control what UI is rendered and what actions are valid.
   */
  const [phase, setPhase] = useState('loading');
  
  /**
   * question: Current question object from server
   * Contains: questionText, format ('mc' or 'sa'), category, choices (for MC)
   * NOTE: Does NOT contain the answer (server keeps that secret until submission)
   */
  const [question, setQuestion] = useState(null);
  const [displayedQuestionText, setDisplayedQuestionText] = useState('');
  const [visibleChoices, setVisibleChoices] = useState({ W: '', X: '', Y: '', Z: '' });
  
  /**
   * questionNumber: Current question index (1-based for display)
   * totalQuestions: Total questions in this game (usually 10)
   */
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [gameId, setGameId] = useState(null);
  const [currentGameType, setCurrentGameType] = useState(null);
  
  /**
   * score: Both players' scores
   * Updated after each question from server events
   */
  const [score, setScore] = useState({ player1: 0, player2: 0 });
  
  /**
   * myPosition: 'player1' or 'player2' - which player this user is
   * Important for: displaying correct score, determining if we buzzed, etc.
   */
  const [myPosition, setMyPosition] = useState(null);
  
  /**
   * opponent: Opponent player info (username, rating, isAI)
   * Used for displaying opponent name in UI
   */
  const [opponent, setOpponent] = useState(null);
  
  // -------------------------------------------------------------------------
  // BUZZ/ANSWER STATE - Real-time interaction state
  // -------------------------------------------------------------------------
  
  /**
   * canBuzz: Whether the buzz button is active
   * Becomes true when question appears, false after someone buzzes
   */
  const [canBuzz, setCanBuzz] = useState(false);
  
  /**
   * hasBuzzed: Whether THIS player has attempted to buzz
   * Prevents double-buzzing (UI feedback before server confirms)
   */
  const [hasBuzzed, setBuzzed] = useState(false);
  
  /**
   * buzzer: Who buzzed ('player1', 'player2', or null)
   * Set when server confirms a buzz
   */
  const [buzzer, setBuzzer] = useState(null);

  /**
   * eligibleBuzzer: Which player is allowed to buzz right now.
   * - null: Either player can buzz (normal question start)
   * - 'player1'/'player2': Second-chance window after an incorrect answer
   */
  const [eligibleBuzzer, setEligibleBuzzer] = useState(null);
  
  /**
   * answer: User's typed answer
   * (for both short-answer and multiple-choice; MC accepts W/X/Y/Z or full option text)
   */
  const [answer, setAnswer] = useState('');
  const [hasStartedTyping, setHasStartedTyping] = useState(false);
  const [lastTypingAt, setLastTypingAt] = useState(null);
  const [stallSecondsLeft, setStallSecondsLeft] = useState(null);
  const [opponentStartedTyping, setOpponentStartedTyping] = useState(false);
  const [opponentLastTypingAt, setOpponentLastTypingAt] = useState(null);
  const [opponentStallSecondsLeft, setOpponentStallSecondsLeft] = useState(null);
  const [opponentLiveAnswer, setOpponentLiveAnswer] = useState('');
  
  /**
   * timeLeft: Seconds remaining for current action
   * - 5 seconds for toss-up buzz windows (after reading completes)
   * - 2 seconds for toss-up answer start
   * - 20 seconds for bonuses
   */
  const [timeLeft, setTimeLeft] = useState(0);
  
  // -------------------------------------------------------------------------
  // RESULT STATE - Question and game results
  // -------------------------------------------------------------------------
  
  /**
   * lastResult: Result of the most recent answer
   * Contains: isCorrect, correctAnswer, who answered, etc.
   * Used for the review phase display
   */
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
  
  /**
   * gameResult: Final game result
   * Contains: winner, finalScore, ratingChanges (for ranked)
   * Set when game:end event is received
   */
  const [gameResult, setGameResult] = useState(null);
  
  // -------------------------------------------------------------------------
  // COUNTDOWN STATE
  // -------------------------------------------------------------------------
  
  /**
   * countdown: Countdown number before game starts (3, 2, 1, GO!)
   * null when not counting down
   */
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /**
   * ROUTE USERS TO A DEDICATED INVALID/EXPIRED GAME PAGE
   *
   * We centralize this flow so all invalid-link paths behave consistently.
   */
  const redirectToGameError = useCallback((reason = 'invalid', message = '') => {
    if (message) toast.error(message);
    const safeReason = encodeURIComponent(reason);
    const safeCode = encodeURIComponent(gameCode || '');
    navigate(`/game-error?reason=${safeReason}&gameCode=${safeCode}`, { replace: true });
  }, [navigate, gameCode]);

  /**
   * ===========================================================================
   * ACTION HANDLERS
   * ===========================================================================
   * 
   * IMPORTANT: These are defined BEFORE useEffects that depend on them.
   * JavaScript const/let are not hoisted like function declarations,
   * so they must be declared before use.
   * 
   * useCallback memoizes these functions so they don't change on every render.
   * This is important because:
   * 1. They're in useEffect dependency arrays
   * 2. Changing dependencies causes effects to re-run
   * 3. We want effects to run only when truly necessary
   */
  
  /**
   * HANDLE BUZZ
   * 
   * Called when player presses the buzz button or spacebar.
   * Sends buzz event to server and updates local state optimistically.
   * 
   * OPTIMISTIC UI:
   * We disable the button immediately (setBuzzed(true)) before server confirms.
   * This makes the UI feel instant. If server rejects, we'd need to revert.
   */
  const handleBuzz = useCallback(() => {
    // Guard: Can't buzz if not allowed, already buzzed, or no socket
    if (!canBuzz || hasBuzzed || !socket) return;
    
    // Optimistic update: Disable buzz immediately
    setBuzzed(true);
    setCanBuzz(false);
    
    // Send buzz event to server
    // Server will broadcast game:buzzed to all players in the room
    socket.emit('game:buzz', { gameCode });
  }, [canBuzz, hasBuzzed, socket, gameCode]);

  /**
   * Emit typing/selection activity so server can enforce:
   * - typing must start within 2s
   * - idle gap >2s times out
   * - 60s hard cap
   */
  const emitInputActivity = useCallback((progress = 0, text = '') => {
    if (!socket) return;
    socket.emit('game:inputActivity', { gameCode, progress, text });
  }, [socket, gameCode]);

  /**
   * HANDLE SUBMIT ANSWER
   * 
   * Called when player submits their answer (button click or Enter key).
   * Sends the answer to server for verification.
   */
  const handleSubmitAnswer = useCallback(() => {
    if (!socket) return;
    if (phase !== 'answering') return;
    
    // Multiple choice uses the same textbox as short answer.
    // Valid MC responses include:
    // - The option letter (W/X/Y/Z)
    // - The exact option text
    const finalAnswer = answer;
    
    // Send answer to server
    // Server will verify, update scores, and broadcast result
    socket.emit('game:answer', { 
      gameCode, 
      answer: finalAnswer || ''  // Empty string if nothing selected/typed
    });
    
    // Move to waiting state while server processes
    setPhase('waiting_result');
  }, [answer, socket, gameCode, phase]);

  /**
   * HANDLE LEAVE GAME
   * 
   * Called when player wants to exit the game (back button, forfeit).
   * Notifies server so opponent can be informed.
   */
  const handleLeaveGame = useCallback(() => {
    if (socket) {
      // Notify server we're leaving (triggers forfeit in active games)
      socket.emit('game:leave', { gameCode, intentionalForfeit: true });
    }
    // Navigate back to play selection
    navigate('/play');
  }, [socket, gameCode, navigate]);

  /**
   * FINAL-PAGE PROTEST ADJUST FLOW
   *
   * On the question-closed page only:
   * - 3s window to start protest
   * - 10s to choose score deltas (-4/0/+4 for both sides)
   */
  const handleStartProtestAdjust = useCallback(() => {
    if (!socket || isSubmittingProtest) return;
    if (!protestAdjustState || protestAdjustState.phase !== 'window') return;

    // Optimistic transition: once user clicks Protest, go straight into
    // score-adjust selection UI while server confirms the selection window.
    setProtestAdjustState((current) => current ? ({
      ...current,
      phase: 'selecting',
      selector: myPosition,
      selectionEndsAt: Date.now() + 10000
    }) : current);
    setShowProtestAdjustModal(true);
    setIsSubmittingProtest(true);
    socket.emit('game:protestAdjust:start', { gameCode });
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
    const liveAllowedPairs = Array.isArray(protestAdjustState.allowedPairs)
      ? protestAdjustState.allowedPairs
      : [];
    if (liveAllowedPairs.length > 0) {
      const pairIsAllowed = liveAllowedPairs.some((pair) => (
        Number(pair?.myDelta) === Number(myAdjustDelta) &&
        Number(pair?.opponentDelta) === Number(opponentAdjustDelta)
      ));
      if (!pairIsAllowed) return;
    }
    setIsSubmittingProtest(true);
    socket.emit('game:protestAdjust:submit', {
      gameCode,
      myDelta: Number(myAdjustDelta),
      opponentDelta: Number(opponentAdjustDelta)
    });
  }, [socket, protestAdjustState, myPosition, myAdjustDelta, opponentAdjustDelta, gameCode, isSubmittingProtest]);

  const handleRespondProtestAdjust = useCallback((decision) => {
    if (!socket || isSubmittingProtest) return;
    if (!protestAdjustState || protestAdjustState.phase !== 'awaiting_response') return;
    if (String(protestAdjustState.awaitingResponder || '') !== String(myPosition || '')) return;
    setIsSubmittingProtest(true);
    socket.emit('game:protestAdjust:respond', { gameCode, decision });
  }, [socket, protestAdjustState, myPosition, gameCode, isSubmittingProtest]);

  const handleCancelProtestAdjust = useCallback(() => {
    if (!socket || isSubmittingProtest) return;
    if (!protestAdjustState) return;
    const phaseName = String(protestAdjustState.phase || '');
    const canCancelAsSelector =
      phaseName === 'selecting' &&
      String(protestAdjustState.selector || '') === String(myPosition || '');
    const canCancelAsProposer =
      phaseName === 'awaiting_response' &&
      String(protestAdjustState.proposer || '') === String(myPosition || '');
    if (!canCancelAsSelector && !canCancelAsProposer) return;
    setIsSubmittingProtest(true);
    socket.emit('game:protestAdjust:cancel', { gameCode });
  }, [socket, isSubmittingProtest, protestAdjustState, myPosition, gameCode]);

  /**
   * HANDLE READY FOR NEXT QUESTION
   *
   * During the post-answer reveal stage, both players can click Ready to
   * skip the remaining countdown and move on immediately.
   */
  const handleReadyForNext = useCallback(() => {
    if (!socket || phase !== 'review' || !lastResult?.questionClosed || isReadyForNext) return;

    setIsReadyForNext(true);
    socket.emit('game:nextReady', { gameCode });
  }, [socket, phase, lastResult, isReadyForNext, gameCode]);

  /**
   * ===========================================================================
   * SOCKET EVENT HANDLERS SETUP
   * ===========================================================================
   * 
   * This useEffect sets up all socket event listeners.
   * 
   * CRITICAL: This must run BEFORE the initialization effect that emits events.
   * If we emit game:create before handlers are registered, we'll miss events!
   * 
   * WHY USE socket.on() DIRECTLY?
   * The useSocket() hook provides on() helper, but using socket.on() directly
   * gives us more control and avoids potential race conditions with the helper.
   */
  useEffect(() => {
    if (readUnlockTimerRef.current) {
      clearTimeout(readUnlockTimerRef.current);
      readUnlockTimerRef.current = null;
    }
    // Guard: No socket = no events to listen to
    if (!socket) return;

    /**
     * GAME:CREATED
     * Confirms that the game room was successfully created on the server.
     * For AI games, game:start follows immediately.
     */
    const handleCreated = (data) => {
      console.log('[Socket] Game created event received:', data);
    };
    
    /**
     * GAME:START
     * Game is starting! Begin countdown.
     * Received when:
     * - AI game: Immediately after game:create
     * - Ranked game: When both players join
     * - Casual game: When both players click "Ready"
     */
    const handleStart = (data) => {
      console.log('[Socket] Game start event received:', data);

      // Ignore duplicate game:start events that can occur in reconnect/race scenarios.
      if (hasReceivedStartRef.current) return;
      hasReceivedStartRef.current = true;
      
      // Clear the "game failed to start" timeout since we're starting!
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
      
      // Set total questions and begin countdown
      setTotalQuestions(data.totalQuestions || 10);
      activeQuestionRef.current = 0;
      activeRoundIdRef.current = null;
      setProtestState(null);
      setPhase('countdown');
      setCountdown(3);  // 3, 2, 1, GO!
    };
    
    /**
     * GAME:PLAYERJOINED
     * Another player joined the game room.
     * For ranked games, this triggers auto-start on the server.
     */
    const handlePlayerJoined = (data) => {
      console.log('[Socket] Player joined event received:', data);
    };

    /**
     * GAME:QUESTION
     * New question arrived! Reset all question-related state.
     * 
     * SECURITY NOTE: The question object does NOT contain the answer.
     * The server keeps the answer secret until someone submits.
     */
    const handleQuestion = (data) => {
      console.log('[Socket] Question received:', data.questionNumber);
      if (readUnlockTimerRef.current) {
        clearTimeout(readUnlockTimerRef.current);
        readUnlockTimerRef.current = null;
      }

      // Record the server-authoritative active question/round.
      hasReceivedStartRef.current = true;
      activeQuestionRef.current = data.questionNumber;
      activeRoundIdRef.current = data.roundId ?? null;
      
      // Set question data
      setQuestion(data.question);
      setDisplayedQuestionText('');
      setVisibleChoices({ W: '', X: '', Y: '', Z: '' });
      setQuestionNumber(data.questionNumber);
      setScore(data.score);  // Updated score from previous question
      setLastResult(null);   // Clear old overlay/result to avoid cross-question bleed
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
      
      // Reset interaction state for new question
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
        setPhase((data.question?.bonusForTeam === myPosition) ? 'answering' : 'waiting_answer');

        const setBonusTimer = () => {
          const remaining = bonusEndsAt > 0
            ? Math.max(0, Math.ceil((bonusEndsAt - Date.now()) / 1000))
            : Number(data.bonusTimeLimitSeconds || 20);
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
        // Toss-up: no buzz timer until reading completes.
        setMyPosition((currentPosition) => {
          const isEligible = !data.restartFor || data.restartFor === currentPosition;
          setCanBuzz(isEligible);
          return currentPosition;
        });

        const setBuzzTimer = () => {
          const remaining = buzzEndsAt > 0
            ? Math.max(0, Math.ceil((buzzEndsAt - Date.now()) / 1000))
            : 5;
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

    /**
     * GAME:BUZZED
     * Someone buzzed in! Determine if it was us or opponent.
     * 
     * FUNCTIONAL UPDATE PATTERN:
     * We use setMyPosition(currentPosition => ...) to read the current value
     * inside the callback. This avoids stale closure issues where the handler
     * captures an old value of myPosition.
     */
    const handleBuzzed = (data) => {
      console.log('[Socket] Buzzed event received:', data);

      // Ignore stale buzz events from previous rounds.
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) {
        return;
      }
      
      setBuzzer(data.playerId);   // Record who buzzed
      setCanBuzz(false);           // No more buzzing allowed
      setTimeLeft(Number(data.answerWindowSeconds ?? 2)); // 2s toss-up answer-start window
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
      
      // Determine if WE buzzed or opponent buzzed
      setMyPosition(currentPosition => {
        if (data.playerId === currentPosition) {
          // WE buzzed - show answering UI
          setPhase('answering');
          // Auto-focus the answer input for quick typing
          setTimeout(() => answerInputRef.current?.focus(), 100);
        } else {
          // OPPONENT buzzed - show waiting UI
          setPhase('waiting_answer');
        }
        return currentPosition;  // Don't change position, just reading it
      });
    };

    /**
     * GAME:ANSWERRESULT
     * Server processed the answer. Show result.
     */
    const handleAnswerResult = (data) => {
      console.log('[Socket] Answer result received:', data);
      if (!['answering', 'waiting_answer', 'waiting_result'].includes(phaseRef.current)) return;

      // Ignore stale answer results from older questions/rounds.
      if (data.questionNumber && data.questionNumber !== activeQuestionRef.current) return;
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;

      setLastResult({
        ...data,
        questionClosed: false
      });   // Store result for display
      setScore(data.score);  // Update scores
      setPhase('review');    // Show review overlay
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

      // Fallback protest state so button is visible even if protest event is delayed.
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
            player1: { ownAnswerAccepted: false, opponentAnswerRejected: false },
            player2: { ownAnswerAccepted: false, opponentAnswerRejected: false }
          }
        });
      }
    };

    /**
     * GAME:PROTESTSTATE
     * Keep protest workflow synchronized for both players.
     */
    const handleProtestState = (data) => {
      // Ignore stale protest updates from older questions/rounds.
      if (data.questionNumber && data.questionNumber !== activeQuestionRef.current) return;
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;
      setProtestState(data);
      setIsSubmittingProtest(false);
    };

    /**
     * GAME:PROTESTRESOLVED
     * Protest has been decided (players agreed, timeout, or AI tie-break).
     */
    const handleProtestResolved = (data) => {
      if (data.questionNumber && data.questionNumber !== activeQuestionRef.current) return;
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;
      setProtestState(current => ({ ...(current || {}), ...data, status: 'resolved' }));
      if (data.score) setScore(data.score);
      setIsSubmittingProtest(false);
    };

    /**
     * GAME:QUESTIONCLOSED
     * The question is fully closed now; safe to reveal the correct answer.
     */
    const handleQuestionClosed = (data) => {
      if (data.questionNumber && data.questionNumber !== activeQuestionRef.current) return;
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;

      setScore(data.score);
      setLastResult(current => current ? ({
        ...current,
        correctAnswer: data.correctAnswer,
        protestResolution: data.protestResolution || current.protestResolution,
        questionClosed: true
      }) : current);

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

    /**
     * GAME:PROTESTADJUSTSTATE
     * Synchronizes final-page protest adjustment state for both sides.
     */
    const handleProtestAdjustState = (data) => {
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

    /**
     * GAME:NEXTREADYSTATE
     * Synchronizes ready status/countdown during post-question reveal.
     */
    const handleNextReadyState = (data) => {
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

    const handleBonusWarning = (data) => {
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;
      if (phaseRef.current !== 'answering') return;
      setBonusWarningSeconds(data.secondsLeft || 5);
    };

    const handleAnswerActivity = (data) => {
      if (!data) return;
      if (data.roundId != null && activeRoundIdRef.current != null && data.roundId !== activeRoundIdRef.current) return;
      const progress = Number(data.progress || 0);
      if (data.playerId === myPosition) {
        setHasStartedTyping((previous) => previous || progress > 0);
        if (data.progressChanged) {
          maxProgressRef.current = Math.max(maxProgressRef.current, progress);
          setLastTypingAt(Number(data.lastProgressAt || Date.now()));
        }
      } else {
        setOpponentStartedTyping((previous) => previous || progress > 0);
        setOpponentLiveAnswer(String(data.text || ''));
        if (data.progressChanged) {
          opponentMaxProgressRef.current = Math.max(opponentMaxProgressRef.current, progress);
          setOpponentLastTypingAt(Number(data.lastProgressAt || Date.now()));
        }
      }
    };

    /**
     * GAME:SECONDCHANCE
     * First buzzer was incorrect. Re-open buzz timer for one eligible player.
     * The player who already buzzed cannot buzz again on this question.
     */
    const handleSecondChance = (data) => {
      console.log('[Socket] Second chance buzz window:', data);
      if (readUnlockTimerRef.current) {
        clearTimeout(readUnlockTimerRef.current);
        readUnlockTimerRef.current = null;
      }

      // Ignore stale second-chance windows from older rounds.
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

      // Determine if THIS player can buzz in this rebound window.
      setMyPosition(currentPosition => {
        const isEligible = !data.eligiblePlayerId || data.eligiblePlayerId === currentPosition;
        const now = Date.now();
        const buzzStartsAt = Number(data.buzzStartsAt || 0);
        const buzzEndsAt = Number(data.buzzEndsAt || 0);
        const applyWindow = () => {
          const remaining = buzzEndsAt > 0
            ? Math.max(0, Math.ceil((buzzEndsAt - Date.now()) / 1000))
            : Math.ceil((data.buzzWindowTime ?? 5000) / 1000);
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

    /**
     * GAME:NOBUZZ
     * Nobody buzzed in time. Question expires.
     */
    const handleNoBuzz = (data) => {
      console.log('[Socket] No buzz - time expired:', data);
      if (phaseRef.current !== 'buzzing') return;

      // Ignore stale no-buzz events from older questions/rounds.
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
            player1: { ownAnswerAccepted: false, opponentAnswerRejected: false },
            player2: { ownAnswerAccepted: false, opponentAnswerRejected: false }
          }
        });
      }
    };

    /**
     * GAME:END
     * Game is over! Show final results.
     * data contains: winner, finalScore, ratingChanges (for ranked)
     */
    const handleEnd = (data) => {
      console.log('[Socket] Game end received:', data);
      if (data.gameId) setGameId(data.gameId);
      setGameResult(data);
      setPhase('complete');
    };

    /**
     * GAME:PLAYERLEFT
     * Opponent left the game.
     * forfeit: true = they left during active game (we win!)
     * forfeit: false = they left during waiting phase
     */
    const handlePlayerLeft = (data) => {
      console.log('[Socket] Player left received:', data);
      
      if (data.forfeit) {
        // Opponent forfeited - we win!
        toast.success('Your opponent left. You win!');
        const currentPosition = myPosition || 'player1';
        setGameResult({
          winner: currentPosition,
          forfeit: true
        });
        setPhase('complete');
      } else {
        // Non-forfeit leaves/disconnects should not end the game.
        toast('Opponent disconnected. Game is still running.');
      }
    };

    const handleConnectionState = (data) => {
      if (!data || !data.playerId) return;
      if (data.playerId === myPosition) return;
      if (data.connected) {
        toast.success('Opponent reconnected');
      } else {
        toast('Opponent disconnected. Game continues.');
      }
    };

    /**
     * GAME:ERROR
     * Something went wrong on the server.
     * 
     * SPECIAL CASE: "Game not found" for player2
     * This can happen if player2 loads faster than player1.
     * We have a retry mechanism, so don't show error toast.
     */
    const handleError = (data) => {
      console.error('[Socket] Game error:', data);
      setIsSubmittingProtest(false);

      // Recovery path for late/invalid answer submits:
      // if client is waiting on a result that the server rejected, restore an active phase.
      if (
        phase === 'waiting_result' &&
        String(data?.code || '').startsWith('ANSWER_REJECTED_')
      ) {
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
        // Silently ignore - retry mechanism will handle it
        return;
      }
      if (isNotFound || isExpired) {
        redirectToGameError(isExpired ? 'expired' : 'invalid', data.message || 'Game is unavailable');
        return;
      }
      toast.error(data.message || 'Game error');
    };


    // -----------------------------------------------------------------------
    // REGISTER ALL EVENT LISTENERS
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // CLEANUP FUNCTION
    // -----------------------------------------------------------------------
    /**
     * useEffect cleanup runs when:
     * - Component unmounts
     * - Dependencies change (before new effect runs)
     * 
     * IMPORTANT: Always remove event listeners to prevent:
     * - Memory leaks
     * - Duplicate handlers
     * - Events firing on unmounted components
     */
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
      
      // Also clean up any pending timeout
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
      }
      if (readUnlockTimerRef.current) {
        clearTimeout(readUnlockTimerRef.current);
        readUnlockTimerRef.current = null;
      }
    };
  }, [socket, redirectToGameError, myPosition]);  // Keep handlers stable; use phaseRef for live phase checks

  /**
   * Stream question text word-by-word at server-provided pace.
   */
  useEffect(() => {
    if (!question?.questionText) {
      setDisplayedQuestionText('');
      return;
    }

    const isTossup = question?.questionKind === 'tossup';
    const shouldStream =
      (isTossup ? phase === 'buzzing' : ['answering', 'waiting_answer'].includes(phase)) &&
      Number(question?.wordPaceMs || 0) > 0 &&
      Number(question?.readStartedAt || 0) > 0;

    if (!shouldStream) {
      // Preserve partially streamed text when buzzing stops early.
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

  /**
   * Reveal MC options after reading completes, option-by-option.
   */
  useEffect(() => {
    if (!question || question.format !== 'mc' || !question.choices) {
      setVisibleChoices({ W: '', X: '', Y: '', Z: '' });
      return;
    }

    const keys = ['W', 'X', 'Y', 'Z'];
    const shouldProgressiveReveal =
      question.revealChoicesAfterRead &&
      Number(question.readEndsAt || 0) > 0;

    if (!shouldProgressiveReveal) {
      setVisibleChoices({
        W: question.choices.W ? `W. ${question.choices.W}` : '',
        X: question.choices.X ? `X. ${question.choices.X}` : '',
        Y: question.choices.Y ? `Y. ${question.choices.Y}` : '',
        Z: question.choices.Z ? `Z. ${question.choices.Z}` : ''
      });
      return;
    }

    const canRevealInPhase = question.questionKind === 'tossup'
      ? phase === 'buzzing'
      : ['answering', 'waiting_answer'].includes(phase);
    if (!canRevealInPhase) return;

    setVisibleChoices({ W: '', X: '', Y: '', Z: '' });
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
        setVisibleChoices((prev) => ({ ...prev, [key]: `${key}.` }));
      }, cursorMs));
      cursorMs += prefixPauseMs;

      optionWords.forEach((_, wordIndex) => {
        timers.push(setTimeout(() => {
          const partial = optionWords.slice(0, wordIndex + 1).join(' ');
          setVisibleChoices((prev) => ({ ...prev, [key]: `${key}. ${partial}` }));
        }, cursorMs));
        cursorMs += optionWordPaceMs;
      });

      if (index < keys.length - 1) {
        cursorMs += interOptionPauseMs;
      }
    });

    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [question, phase]);

  /**
   * POST-QUESTION COUNTDOWN EFFECT
   *
   * Shows a visible 10-second countdown after answer reveal unless both
   * players click ready and the server advances earlier.
   */
  useEffect(() => {
    if (phase !== 'review' || !lastResult?.questionClosed || isNextCountdownPaused) return;
    if (nextCountdown === null || nextCountdown <= 0) return;

    const timer = setTimeout(() => {
      setNextCountdown((prev) => (prev === null ? prev : Math.max(prev - 1, 0)));
    }, 1000);

    return () => clearTimeout(timer);
  }, [phase, lastResult, nextCountdown, isNextCountdownPaused]);

  /**
   * PROTEST COUNTDOWN RENDER TICK
   *
   * Protest windows use absolute timestamps from the server.
   * While next-question countdown is paused, we still need a local render tick
   * so the 10s protest timer visibly decrements on both clients.
   */
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

  /**
   * ===========================================================================
   * GAME INITIALIZATION EFFECT
   * ===========================================================================
   * 
   * This effect loads game data and initializes the socket room.
   * It runs AFTER socket handlers are set up (above).
   * 
   * FLOW:
   * 1. Fetch game data from REST API
   * 2. Determine if we're player1 or player2
   * 3. Emit game:create (player1) or game:join (player2)
   * 4. Wait for game:start event
   */
  useEffect(() => {
    // PREVENT DOUBLE INITIALIZATION
    // React StrictMode in development calls effects twice.
    // This flag ensures we only initialize once.
    if (hasInitialized.current) return;
    
    /**
     * ASYNC INITIALIZATION FUNCTION
     * 
     * useEffect callbacks can't be async directly, so we define
     * an async function inside and call it.
     */
    const initGame = async () => {
      try {
        // STEP 1: Fetch game data from REST API
        const response = await gameAPI.getByCode(gameCode);
        
        // Handle different API response structures
        // Some APIs return { data: { game } }, others { data: { data: { game } }}
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
          player2: game.player2 ? { isAI: game.player2.isAI, difficulty: game.player2.aiDifficulty } : null,
          user: user?.id
        });

        // STEP 2: Determine player position
        const userId = String(user?.id ?? '');
        const isPlayer1 = String(game.player1?.userId ?? '') === userId;
        const isAIGame = Boolean(game.player2?.isAI);
        const position = isAIGame ? 'player1' : (isPlayer1 ? 'player1' : 'player2');
        
        console.log('[Game Init] Game analysis:', { isPlayer1, isAIGame, myPosition: position });

        setMyPosition(position);
        setOpponent(isPlayer1 ? game.player2 : game.player1);
        setGameId(game._id || game.id || null);
        setCurrentGameType(game.gameType || null);

        if (['cancelled', 'abandoned'].includes(game.status)) {
          redirectToGameError('expired', 'This game has expired');
          return;
        }

        // HANDLE COMPLETED GAMES
        // If user refreshes after game ended, show results
        if (game.status === 'completed') {
          setGameResult({ winner: game.winner, score: game.score });
          setPhase('complete');
          return;
        }

        // Mark as initialized BEFORE emitting to prevent re-entry
        hasInitialized.current = true;

        /**
         * TIMEOUT SETUP
         * 
         * If game:start doesn't arrive within timeout, show error.
         * This handles cases where:
         * - Server crashed
         * - Network issues
         * - Opponent never showed up
         */
        const setupTimeout = (timeoutMs = 15000) => {
          // If start already arrived, don't arm a stale timeout.
          if (hasReceivedStartRef.current) return;
          if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
          startTimeoutRef.current = setTimeout(() => {
            // Ignore stale timeout if game already started.
            if (hasReceivedStartRef.current) return;
            console.error('[Game] Timeout waiting for game:start');
            toast.error('Game failed to start. Please try again.');
            navigate('/play');
          }, timeoutMs);
        };

        // STEP 3: Initialize socket room
        
        // AI GAME: Create room and start immediately
        if (isAIGame) {
          console.log('[AI Game] Creating AI game room:', gameCode);
          socket.emit('game:create', { gameCode, gameType: game.gameType ?? 'ai' });
          // Don't regress UI phase if game:start already arrived.
          setPhase(currentPhase => hasReceivedStartRef.current ? currentPhase : 'connecting');
          setupTimeout(10000);      // 10 second timeout for AI games
          return;
        }

        // MULTIPLAYER GAME
        // Ranked/unranked queues auto-start as soon as both players connect.
        const autoStartTypes = ['ranked', 'unranked_1v1'];
        const initialPhase = autoStartTypes.includes(game.gameType) ? 'connecting' : 'waiting';
        
        if (isPlayer1) {
          // Player 1 creates the socket room
          console.log('[Multiplayer] Player 1 creating game room:', gameCode);
          socket.emit('game:create', { gameCode, gameType: game.gameType });
          setPhase(currentPhase => hasReceivedStartRef.current ? currentPhase : initialPhase);
          if (autoStartTypes.includes(game.gameType)) setupTimeout(15000);
        } else {
          // Player 2 joins the existing room
          console.log('[Multiplayer] Player 2 joining game room:', gameCode);
          socket.emit('game:join', { gameCode });
          setPhase(currentPhase => hasReceivedStartRef.current ? currentPhase : initialPhase);
          if (autoStartTypes.includes(game.gameType)) setupTimeout(15000);
        }
      } catch (err) {
        hasInitialized.current = false; // Allow retry after a real init failure
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

    // -----------------------------------------------------------------------
    // GUARD CONDITIONS
    // -----------------------------------------------------------------------
    // Wait for all dependencies to be ready before initializing
    
    if (!user) {
      console.log('[Game Init] Waiting for user...');
      return;  // Auth not loaded yet
    }
    if (!socket || !isConnected) {
      console.log('[Game Init] Waiting for socket connection...');
      return;  // Socket not connected yet
    }
    
    // All ready - initialize!
    // Lock immediately so StrictMode double-effect cannot spawn a second init.
    hasInitialized.current = true;
    console.log('[Game Init] Starting initialization for game:', gameCode);
    initGame();
  }, [gameCode, user, socket, isConnected, navigate, redirectToGameError]);

  /**
   * ===========================================================================
   * PLAYER 2 RETRY EFFECT
   * ===========================================================================
   * 
   * RACE CONDITION HANDLING:
   * When both players navigate to /game/:gameCode from matchmaking,
   * player2 might arrive before player1 has created the room.
   * 
   * SOLUTION: Player2 retries game:join every 2 seconds while waiting.
   * Once the room exists, the join succeeds and game starts.
   */
  useEffect(() => {
    /**
     * RETRY CONDITIONS
     * 
     * Player2 may sit in 'waiting' or 'connecting' while room init catches up.
     * In both cases, if player2 reaches /game first, room may not exist yet.
     */
    const canRetryPhase = phase === 'waiting' || phase === 'connecting';
    if (!canRetryPhase || myPosition !== 'player2' || !gameCode || !socket || hasReceivedStartRef.current) return;
    
    const interval = setInterval(() => {
      socket.emit('game:join', { gameCode });
    }, 2000);  // Retry every 2 seconds
    
    return () => clearInterval(interval);
  }, [phase, myPosition, gameCode, socket]);

  /**
   * ===========================================================================
   * COUNTDOWN TIMER EFFECT
   * ===========================================================================
   * 
   * Simple countdown: 3 → 2 → 1 → 0 → null
   * When countdown reaches 0, first question comes from socket.
   */
  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);  // Decrement every second
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      // Countdown finished - clear it and wait for question
      setCountdown(null);
    }
  }, [countdown]);

  /**
   * ===========================================================================
   * BUZZ/ANSWER TIMER EFFECT
   * ===========================================================================
   * 
   * Handles two timers:
   * 1. Buzz timer (5 seconds) after reading completes
   * 2. Toss-up answer-start timer (2 seconds) and bonus timer (20 seconds)
   */
  useEffect(() => {
    const isTimedPhase = phase === 'buzzing' || phase === 'answering' || phase === 'waiting_answer';
    if (!isTimedPhase || timeLeft <= 0) return;
    const isBonusQuestion = question?.questionKind === 'bonus';
    const readEndsAt = Number(question?.fullReadEndsAt || question?.readEndsAt || 0);

    // No timer should run while the question is still being read.
    if (phase === 'buzzing' && readEndsAt > Date.now()) return;
    if ((phase === 'answering' || phase === 'waiting_answer') && isBonusQuestion && readEndsAt > Date.now()) return;

    // Freeze the visible answer timer after the buzzing side starts typing.
    if (!isBonusQuestion && phase === 'answering' && hasStartedTyping) return;
    if (!isBonusQuestion && phase === 'waiting_answer' && opponentStartedTyping) return;

    /**
     * FUNCTIONAL UPDATE PREVENTS TIMER "FREEZE" WHILE TYPING
     * 
     * We avoid depending on answer input state here so rapid typing
     * doesn't reset the countdown timeout each keystroke.
     */
    const timer = setTimeout(() => {
      setTimeLeft(prev => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearTimeout(timer);
  }, [timeLeft, phase, hasStartedTyping, opponentStartedTyping, question]);

  /**
   * Show a 2.0-second stall countdown (always visible while answering).
   * For bonus, stall only becomes active after the main timer reaches 0.
   */
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
      const anchor = hasStartedTyping
        ? Math.max(Number(lastTypingAt || 0), windowStartedAt)
        : windowStartedAt;
      const idleMs = Math.max(0, Date.now() - anchor);
      const remaining = Math.max(0, (2000 - idleMs) / 1000);
      setStallSecondsLeft(Number(remaining.toFixed(1)));
    }, 120);

    return () => clearInterval(timer);
  }, [phase, hasStartedTyping, lastTypingAt, question, timeLeft]);

  /**
   * Mirror stall countdown UX for the non-buzzing player.
   */
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
      const anchor = opponentStartedTyping
        ? Math.max(Number(opponentLastTypingAt || 0), windowStartedAt)
        : windowStartedAt;
      const idleMs = Math.max(0, Date.now() - anchor);
      const remaining = Math.max(0, (2000 - idleMs) / 1000);
      setOpponentStallSecondsLeft(Number(remaining.toFixed(1)));
    }, 120);

    return () => clearInterval(timer);
  }, [phase, opponentStartedTyping, opponentLastTypingAt, question, timeLeft]);

  /**
   * ===========================================================================
   * KEYBOARD SHORTCUTS EFFECT
   * ===========================================================================
   * 
   * Enables keyboard interactions for faster gameplay:
   * - Space: Buzz in
   * - Enter: Submit answer (answering phase) / Ready for next (review phase)
   */
  useEffect(() => {
    const handleKeyDown = (e) => {
      // SPACE: Buzz in (during buzzing phase)
      if (phase === 'buzzing' && e.code === 'Space') {
        e.preventDefault();  // Prevent page scroll
        handleBuzz();
      }
      
      // ENTER: Submit answer (during answering phase)
      if (phase === 'answering' && e.code === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmitAnswer();
      }

      // REVIEW READY SHORTCUT
      // When question closure is shown, Enter can trigger "Ready For Next".
      if (phase === 'review' && lastResult?.questionClosed && e.code === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleReadyForNext();
      }
    };

    // Add global keyboard listener
    window.addEventListener('keydown', handleKeyDown);
    
    // Cleanup: Remove listener when component unmounts or deps change
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, lastResult, handleBuzz, handleSubmitAnswer, handleReadyForNext]);

  /**
   * ===========================================================================
   * HELPER FUNCTIONS
   * ===========================================================================
   * 
   * These are simple pure functions - no hooks, just transformations.
   * They could be moved outside the component for better organization.
   */
  
  /**
   * Get color for a question category (for the category badge)
   */
  const getCategoryColor = (category) => {
    const colors = {
      biology: '#22c55e',       // Green
      chemistry: '#f59e0b',     // Orange/Amber
      physics: '#3b82f6',       // Blue
      math: '#8b5cf6',          // Purple
      earthScience: '#10b981',  // Teal
      astronomy: '#6366f1',     // Indigo
      energy: '#eab308',        // Yellow
      computerScience: '#06b6d4' // Cyan
    };
    return colors[category] || '#64748b';  // Default: Slate
  };

  /**
   * Get display name for a question category
   */
  const getCategoryName = (category) => {
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
    return names[category] || category;  // Fallback to raw category name
  };

  /**
   * BUZZ BUTTON STATE HELPERS
   * 
   * During second-chance windows, only one player is eligible to buzz.
   * We compute this once to keep JSX readable.
   */
  const isEligibleForCurrentWindow = !eligibleBuzzer || eligibleBuzzer === myPosition;
  const isBuzzDisabled = !canBuzz || hasBuzzed || !isEligibleForCurrentWindow;
  const isAIOpponent = Boolean(opponent?.isAI);
  const getPlayerDisplayNameById = useCallback((playerId) => {
    if (playerId === 'player1') return myPosition === 'player1' ? (user?.username || 'Player 1') : (opponent?.username || 'Player 1');
    if (playerId === 'player2') return myPosition === 'player2' ? (user?.username || 'Player 2') : (opponent?.username || (isAIOpponent ? 'AI' : 'Player 2'));
    return playerId || 'Unknown';
  }, [myPosition, opponent, user, isAIOpponent]);
  const effectiveProtestState = protestState || null;
  const canShowCorrectAnswer = Boolean(
    lastResult?.correctAnswer && (lastResult?.isCorrect || lastResult?.questionClosed)
  );
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
  const protesterNames = (effectiveProtestState?.protestedByNames && effectiveProtestState.protestedByNames.length > 0)
    ? effectiveProtestState.protestedByNames
    : (effectiveProtestState?.protestedBy || []).map(getPlayerDisplayNameById);
  const canOpenProtest = Boolean(
    waitingForNextQuestion && protestAdjustState
  );
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
  const isProtestButtonDisabled = Boolean(
    !protestAdjustState ||
    isSubmittingProtest ||
    ['pending_ai', 'applied', 'closed'].includes(String(protestAdjustState.phase || ''))
  );
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
      return protestAdjustState.allowedPairs
        .map((pair) => ({
          myDelta: Number(pair?.myDelta),
          opponentDelta: Number(pair?.opponentDelta)
        }))
        .filter((pair) => Number.isFinite(pair.myDelta) && Number.isFinite(pair.opponentDelta));
    }
    const fallbackDeltas = Array.isArray(protestAdjustState?.allowedDeltas)
      ? protestAdjustState.allowedDeltas.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [-4, 0, 4];
    return fallbackDeltas.flatMap((myDelta) => (
      fallbackDeltas.map((opponentDelta) => ({ myDelta, opponentDelta }))
    ));
  }, [protestAdjustState?.allowedPairs, protestAdjustState?.allowedDeltas]);

  const myAdjustOptions = useMemo(() => (
    Array.from(new Set(protestAllowedPairs.map((pair) => Number(pair.myDelta))))
  ), [protestAllowedPairs]);

  const opponentAdjustOptions = useMemo(() => (
    Array.from(
      new Set(
        protestAllowedPairs
          .filter((pair) => Number(pair.myDelta) === Number(myAdjustDelta))
          .map((pair) => Number(pair.opponentDelta))
      )
    )
  ), [protestAllowedPairs, myAdjustDelta]);

  const isSelectedProtestPairValid = protestAllowedPairs.some((pair) => (
    Number(pair.myDelta) === Number(myAdjustDelta) &&
    Number(pair.opponentDelta) === Number(opponentAdjustDelta)
  ));

  useEffect(() => {
    if (protestAllowedPairs.length === 0) return;
    if (isSelectedProtestPairValid) return;
    const fallback = protestAllowedPairs[0];
    setMyAdjustDelta(Number(fallback.myDelta));
    setOpponentAdjustDelta(Number(fallback.opponentDelta));
  }, [protestAllowedPairs, isSelectedProtestPairValid]);

  /**
   * ===========================================================================
   * RENDER - PHASE-BASED UI
   * ===========================================================================
   * 
   * The component renders different UI based on the current phase.
   * Using early returns makes this cleaner than nested conditionals.
   * 
   * RENDER PATTERN:
   * if (phase === 'X') return <XUI />;
   * if (phase === 'Y') return <YUI />;
   * return <DefaultUI />;
   */

  // -------------------------------------------------------------------------
  // LOADING / CONNECTING PHASE
  // -------------------------------------------------------------------------
  /**
   * Show loading spinner while:
   * - Waiting for socket connection
   * - Waiting for game data to load
   * - Waiting for game:start event (connecting phase)
   */
  if (phase === 'loading' || phase === 'connecting') {
    return (
      <div className={styles.gameContainer}>
        <div className={styles.loadingScreen}>
          {/* Animated spinner (CSS animation) */}
          <div className={styles.spinner}></div>
          
          {/* Dynamic loading message based on state */}
          <p className={styles.loadingText}>
            {phase === 'connecting' 
              ? 'Starting game...' 
              : !isConnected 
                ? 'Connecting to server...' 
                : 'Loading game...'}
          </p>
          
          {/* Show auth status if user not loaded */}
          {!user && (
            <p className={styles.loadingSubtext}>Checking authentication...</p>
          )}
          
          {/* Cancel button when connecting */}
          {phase === 'connecting' && (
            <Button 
              variant="secondary" 
              icon={<FiArrowLeft />} 
              onClick={() => navigate('/play')} 
              className={styles.goBackButton}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // WAITING PHASE
  // -------------------------------------------------------------------------
  /**
   * Waiting for opponent to join.
   * Shows game code for sharing.
   */
  if (phase === 'waiting') {
    return (
      <div className={styles.gameContainer}>
        <div className={styles.waitingScreen}>
          {/* Animated dots indicating waiting */}
          <div className={styles.waitingAnimation}>
            <div className={styles.waitingDot}></div>
            <div className={styles.waitingDot}></div>
            <div className={styles.waitingDot}></div>
          </div>
          
          <h2>Waiting for opponent...</h2>
          
          {/* Display game code for sharing */}
          <p className={styles.gameCodeDisplay}>
            Game Code: <strong>{gameCode}</strong>
          </p>
          
          {/* Back button to cancel */}
          <Button variant="secondary" icon={<FiArrowLeft />} onClick={handleLeaveGame} className={styles.goBackButton}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // OPPONENT LEFT PHASE
  // -------------------------------------------------------------------------
  /**
   * Opponent disconnected or left during waiting phase.
   * Not a forfeit - game never started.
   */
  if (phase === 'opponent_left') {
    return (
      <div className={styles.gameContainer}>
        <div className={styles.waitingScreen}>
          <h2>Opponent left the game</h2>
          <p>The other player has disconnected or left.</p>
          <Button variant="primary" icon={<FiHome />} onClick={() => navigate('/play')}>
            Back to Play
          </Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // COUNTDOWN PHASE
  // -------------------------------------------------------------------------
  /**
   * 3... 2... 1... GO! countdown before first question.
   * 
   * FRAMER MOTION ANIMATION:
   * key={countdown} tells React this is a different element for each number,
   * triggering enter/exit animations for each countdown step.
   */
  if (phase === 'countdown' || countdown !== null) {
    return (
      <div className={styles.gameContainer}>
        <div className={styles.countdownScreen}>
          <motion.div
            key={countdown}  // New key = new element = animate
            initial={{ scale: 0.5, opacity: 0 }}   // Start small and transparent
            animate={{ scale: 1, opacity: 1 }}     // Animate to full size
            exit={{ scale: 1.5, opacity: 0 }}      // Exit: grow and fade
            className={styles.countdownNumber}
          >
            {countdown || 'GO!'}
          </motion.div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // GAME COMPLETE PHASE
  // -------------------------------------------------------------------------
  /**
   * Game finished - show results.
   * Displays: winner, final score, rating changes (for ranked)
   */
  if (phase === 'complete' && gameResult) {
    const finalPlayer1Score = gameResult.finalScore?.player1 ?? score.player1 ?? 0;
    const finalPlayer2Score = gameResult.finalScore?.player2 ?? score.player2 ?? 0;
    const inferredWinner = gameResult.winner || (
      finalPlayer1Score === finalPlayer2Score
        ? 'tie'
        : finalPlayer1Score > finalPlayer2Score
          ? 'player1'
          : 'player2'
    );
    const oneVOneReplayPath = String(currentGameType || '') === 'ranked'
      ? '/play?mode=ranked&autoQueue=1'
      : String(currentGameType || '') === 'unranked_1v1'
        ? '/play?mode=unranked&autoQueue=1'
        : '/play';
    const isWinner = inferredWinner === myPosition;
    const isTie = inferredWinner === 'tie';

    return (
      <div className={styles.gameContainer}>
        <div className={styles.resultScreen}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            // Dynamic class based on result
            className={`${styles.resultCard} ${isWinner ? styles.win : isTie ? styles.tie : styles.lose}`}
          >
            {/* Result emoji */}
            <div className={styles.resultIcon}>
              {isWinner ? '🏆' : isTie ? '🤝' : '💪'}
            </div>
            
            {/* Result title */}
            <h1 className={styles.resultTitle}>
              {isWinner ? 'Victory!' : isTie ? 'Tie Game!' : 'Defeat'}
            </h1>
            
            {/* Final score display */}
            <div className={styles.finalScore}>
              <span className={myPosition === 'player1' ? styles.myScore : ''}>
                {finalPlayer1Score}
              </span>
              <span className={styles.scoreDivider}>-</span>
              <span className={myPosition === 'player2' ? styles.myScore : ''}>
                {finalPlayer2Score}
              </span>
            </div>
            
            {/* Rating change (for ranked games) */}
            {gameResult.ratingChanges && (
              <div className={`${styles.ratingChange} ${(myPosition === 'player1' ? gameResult.ratingChanges.player1Change : gameResult.ratingChanges.player2Change) > 0 ? styles.positive : styles.negative}`}>
                {(myPosition === 'player1' ? gameResult.ratingChanges.player1Change : gameResult.ratingChanges.player2Change) > 0 ? '+' : ''}
                {myPosition === 'player1' ? gameResult.ratingChanges.player1Change : gameResult.ratingChanges.player2Change} Rating
              </div>
            )}
            
            {/* Action buttons */}
              <div className={styles.resultActions}>
              <Button variant="primary" icon={<FiRepeat />} onClick={() => navigate(oneVOneReplayPath)}>
                Play Again
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate(`/games/${gameResult.gameId || gameId}/review`)}
                disabled={!gameResult.gameId && !gameId}
              >
                Game Review
              </Button>
              <Button variant="secondary" onClick={() => navigate('/dashboard')}>
                Dashboard
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // MAIN GAME UI (DEFAULT)
  // -------------------------------------------------------------------------
  /**
   * The active game interface.
   * Shown during: buzzing, answering, waiting_answer, review phases.
   * 
   * STRUCTURE:
   * - Header: Question progress + Scoreboard
   * - Main: Question card + Review overlay
   * - Footer: Timer + Action buttons (Buzz/Submit)
   */
  return (
    <div className={styles.gameContainer}>
      {['buzzing', 'answering', 'waiting_answer', 'waiting_result', 'review'].includes(phase) && (
        <div className={styles.topLeftAction}>
          <Button variant="danger" onClick={handleLeaveGame}>
            Forfeit Match
          </Button>
          <div className={styles.topLeftCounter}>
            {questionNumber}/{totalQuestions}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* HEADER: Progress and Scores */}
      {/* ------------------------------------------------------------------ */}
      <header className={styles.header}>
        {/* Question progress indicator */}
        <div className={styles.questionProgress}>
          Question {questionNumber} of {totalQuestions}
        </div>
        
        {/* Scoreboard */}
        <div className={styles.scoreBoard}>
          {/* Player 1 score */}
          <div className={`${styles.playerScore} ${myPosition === 'player1' ? styles.me : ''}`}>
            <span className={styles.playerName}>
              {myPosition === 'player1' ? 'You' : opponent?.username || 'Opponent'}
            </span>
            <span className={styles.scoreValue}>{score.player1}</span>
          </div>
          
          <span className={styles.vs}>vs</span>
          
          {/* Player 2 score */}
          <div className={`${styles.playerScore} ${myPosition === 'player2' ? styles.me : ''}`}>
            <span className={styles.scoreValue}>{score.player2}</span>
            <span className={styles.playerName}>
              {myPosition === 'player2' ? 'You' : opponent?.username || 'AI'}
            </span>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* MAIN: Question Area */}
      {/* ------------------------------------------------------------------ */}
      <main className={styles.main}>
        {/* 
          AnimatePresence enables exit animations.
          mode="wait" ensures old element exits before new enters.
        */}
        <AnimatePresence mode="wait">
          {question && (
            <motion.div
              key={questionNumber}  // New question = new element = animate
              initial={{ opacity: 0, y: 20 }}   // Start below, transparent
              animate={{ opacity: 1, y: 0 }}    // Slide up, visible
              exit={{ opacity: 0, y: -20 }}     // Exit: slide up, fade
              className={styles.questionCard}
            >
              {/* Category badge with dynamic color */}
              <div 
                className={styles.categoryBadge}
                style={{ backgroundColor: getCategoryColor(question.category) }}
              >
                {getCategoryName(question.category)}
              </div>
              
              {/* Question text */}
              <p className={styles.questionText}>{displayedQuestionText || question.questionText}</p>

              {/* Multiple-choice options are shown as read text (not clickable). */}
              {question.format === 'mc' && question.choices && (
                <div className={styles.choicesGrid}>
                  {Object.entries(question.choices).map(([letter]) => (
                    <div
                      key={letter}
                      className={`${styles.choiceLine} ${
                        phase === 'review' && lastResult?.correctAnswer?.toUpperCase() === letter ? styles.correct : ''
                      }`}
                    >
                      <span className={styles.choiceText}>{visibleChoices[letter] || `${letter}. ...`}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Single textbox for both SA and MC (Science Bowl behavior). */}
              {phase === 'answering' && (
                <div className={styles.answerInput}>
                  <input
                    ref={answerInputRef}
                    type="text"
                    value={answer}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setAnswer(nextValue);
                      // Stall progress only counts non-whitespace characters.
                      // Repeated spaces must not keep the stall timer alive.
                      const nextProgress = nextValue.replace(/\s/g, '').length;
                      setHasStartedTyping((previous) => previous || nextProgress > 0);
                      if (nextProgress > maxProgressRef.current) {
                        maxProgressRef.current = nextProgress;
                        setLastTypingAt(Date.now());
                      }
                      emitInputActivity(nextProgress, nextValue);
                    }}
                    placeholder="Type your answer..."
                    autoFocus
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Review Overlay - shown after answer submitted */}
        {phase === 'review' && lastResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={styles.reviewOverlay}
          >
            <div className={`${styles.reviewCard} ${lastResult.isCorrect ? styles.correct : styles.incorrect}`}>
              {/* Result icon and message */}
              {lastResult.noBuzz ? (
                <>
                  <FiClock size={48} />
                  <h3>Time's Up!</h3>
                </>
              ) : lastResult.isCorrect ? (
                <>
                  <FiCheck size={48} />
                  <h3>Correct!</h3>
                </>
              ) : (
                <>
                  <FiX size={48} />
                  <h3>Incorrect</h3>
                </>
              )}
              
              {/* Show correct answer */}
              {canShowCorrectAnswer && (
                <p className={styles.correctAnswer}>
                  Answer: <strong>{lastResult.correctAnswer}</strong>
                </p>
              )}

              {/* Show what the answering player submitted (including AI/opponent). */}
              {!lastResult.noBuzz && (
                <p className={styles.correctAnswer}>
                  {lastResult.playerId === myPosition
                    ? 'Your answer'
                    : `${isAIOpponent ? 'AI' : (opponent?.username || 'Opponent')} answer`}:
                  {' '}
                  <strong>{lastResult.answer || 'No answer'}</strong>
                </p>
              )}

              {(lastResult?.resultTag === 'interrupt' || lastResult?.resultTag === 'interrupt_no_penalty') && !lastResult?.isCorrect && !lastResult?.noBuzz && (
                <p className={styles.correctAnswer}>
                  Interrupt penalty: <strong>{lastResult?.resultTag === 'interrupt_no_penalty' ? '0' : '-4'}</strong>
                </p>
              )}

              {waitingForNextQuestion && (
                <div className={styles.nextQuestionPanel}>
                  {Boolean(protestStatusMessage) && (
                    <p className={styles.correctAnswer}>
                      {protestStatusMessage}
                    </p>
                  )}

                  {protesterNames.length > 0 && (
                    <p className={styles.correctAnswer}>
                      Protested by: {protesterNames.join(', ')}
                    </p>
                  )}

                  <p className={styles.correctAnswer}>
                    Next question in <strong>{nextCountdown ?? 15}s</strong>
                    {isNextCountdownPaused ? ' (paused for protest)' : ''}
                  </p>
                  <p className={styles.correctAnswer}>
                    Ready: <strong>{readyCount}/{requiredReadyCount}</strong>
                  </p>
                  <div className={styles.nextActionRow}>
                    <Button
                      variant={isReadyForNext ? 'secondary' : 'primary'}
                      onClick={handleReadyForNext}
                      disabled={isReadyForNext}
                    >
                      {isReadyForNext ? 'Ready' : 'Ready For Next'}
                    </Button>
                    {canOpenProtest && (
                      <Button
                        variant="secondary"
                        onClick={handleOpenProtest}
                        disabled={isProtestButtonDisabled}
                      >
                        {protestButtonLabel}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {waitingForNextQuestion && showProtestAdjustModal && protestAdjustState && ['selecting', 'awaiting_response'].includes(protestAdjustState.phase) && (
                <div className={styles.protestModalBackdrop}>
                  <div className={styles.protestModal}>
                    <div className={styles.protestHeaderRow}>
                      <span className={styles.protestBadge}>
                        {protestAdjustState.phase === 'selecting'
                          ? (protestAdjustState.selector === myPosition ? 'Choose Score Adjustment' : 'Opponent Filing / Countering')
                          : protestAdjustState.phase === 'awaiting_response'
                            ? (protestAdjustState.awaitingResponder === myPosition ? 'Respond to Protest' : 'Waiting for Opponent Decision')
                            : 'AI Adjudication Pending'}
                      </span>
                      <span className={styles.protestCountdownPill}>{protestAdjustSecondsLeft}s</span>
                    </div>

                    <div className={styles.protestSnapshot}>
                      <p className={styles.protestSnapshotLabel}>Question</p>
                      <p className={styles.protestSnapshotText}>{question?.questionText || displayedQuestionText || 'N/A'}</p>
                      {question?.format === 'mc' && question?.choices && (
                        <div className={styles.protestSnapshotChoices}>
                          {['W', 'X', 'Y', 'Z'].map((letter) => (
                            <p key={`protest-choice-${letter}`} className={styles.protestSnapshotChoice}>
                              <strong>{letter}.</strong> {question.choices?.[letter] || '...'}
                            </p>
                          ))}
                        </div>
                      )}
                      <p className={styles.protestSnapshotAnswer}>
                        Official answer: <strong>{protestOfficialAnswer || 'N/A'}</strong>
                      </p>
                    </div>

                    {protestAdjustState.phase === 'selecting' && protestAdjustState.selector === myPosition ? (
                      <>
                        <div className={styles.protestActions}>
                          <label className={styles.adjustField}>
                            <span>You</span>
                            <select
                              className={styles.adjustSelect}
                              value={myAdjustDelta}
                              onChange={(e) => {
                                const nextMyDelta = Number(e.target.value);
                                setMyAdjustDelta(nextMyDelta);
                                const nextOpponentOptions = protestAllowedPairs
                                  .filter((pair) => Number(pair.myDelta) === nextMyDelta)
                                  .map((pair) => Number(pair.opponentDelta));
                                if (!nextOpponentOptions.includes(Number(opponentAdjustDelta)) && nextOpponentOptions.length > 0) {
                                  setOpponentAdjustDelta(nextOpponentOptions[0]);
                                }
                              }}
                            >
                              {myAdjustOptions.map((delta) => (
                                <option key={`my-${delta}`} value={delta}>
                                  {delta > 0 ? `+${delta}` : `${delta}`}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className={styles.adjustField}>
                            <span>Opponent</span>
                            <select className={styles.adjustSelect} value={opponentAdjustDelta} onChange={(e) => setOpponentAdjustDelta(Number(e.target.value))}>
                              {opponentAdjustOptions.map((delta) => (
                                <option key={`opp-${delta}`} value={delta}>
                                  {delta > 0 ? `+${delta}` : `${delta}`}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <Button
                          variant="primary"
                          onClick={handleSubmitProtestAdjust}
                          disabled={isSubmittingProtest || !isSelectedProtestPairValid}
                        >
                          Submit Adjustment
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={handleCancelProtestAdjust}
                          disabled={isSubmittingProtest}
                        >
                          Cancel Protest
                        </Button>
                      </>
                    ) : protestAdjustState.phase === 'awaiting_response' && protestAdjustState.awaitingResponder === myPosition ? (
                      <>
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
                      </>
                    ) : protestAdjustState.phase === 'pending_ai' ? (
                      <p className={styles.correctAnswer}>
                        Protest escalated. AI will decide asynchronously; verdict appears in game review.
                      </p>
                    ) : (
                      <>
                        <p className={styles.correctAnswer}>
                          {protestAdjustState.phase === 'selecting'
                            ? `${selectingPlayerName || 'Opponent'} is choosing score adjustments. You will respond once they submit.`
                            : protestAdjustState.phase === 'awaiting_response'
                              ? `${awaitingResponderName || 'Opponent'} is deciding: accept, reject to AI, or counter.`
                              : 'Waiting for opponent selection...'}
                        </p>
                        {protestAdjustState.phase === 'awaiting_response' && protestAdjustState.proposer === myPosition && (
                          <Button
                            variant="secondary"
                            onClick={handleCancelProtestAdjust}
                            disabled={isSubmittingProtest}
                          >
                            Cancel Protest
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* FOOTER: Timer and Action Buttons */}
      {/* ------------------------------------------------------------------ */}
      <footer className={styles.footer}>
        {/* Timer display (during buzzing or answering) */}
        {(phase === 'buzzing' || phase === 'answering' || phase === 'waiting_answer') && Number(timeLeft || 0) > 0 && (
          <div className={`${styles.timer} ${
            question?.questionKind === 'bonus' && Number(timeLeft || 0) <= 5 ? styles.timerCritical : ''
          }`}>
            <FiClock />
            <span>{timeLeft}s</span>
          </div>
        )}
        {phase === 'answering' && (
          <div className={styles.waitingIndicator}>
            Stall timer: {Number(stallSecondsLeft ?? 2).toFixed(1)}s
          </div>
        )}

        {/* Buzz button (during buzzing phase) */}
        {phase === 'buzzing' && (
          <button 
            className={`${styles.buzzButton} ${isBuzzDisabled ? styles.disabled : ''}`}
            onClick={handleBuzz}
            disabled={isBuzzDisabled}
          >
            <FiZap size={24} />
            <span>BUZZ!</span>
            <span className={styles.buzzHint}>(Press Space)</span>
          </button>
        )}

        {/* Submit button (during answering phase) */}
        {phase === 'answering' && (
          <Button 
            variant="success" 
            size="lg"
            onClick={handleSubmitAnswer}
            icon={<FiCheck />}
          >
            Submit Answer
          </Button>
        )}

        {/* Waiting indicator (when opponent is answering) */}
        {phase === 'waiting_answer' && (
          <div className={styles.waitingIndicator}>
            {`Opponent is answering... Stall timer: ${Number(opponentStallSecondsLeft ?? 2).toFixed(1)}s`}
            {` | Typed: ${opponentLiveAnswer || '...'}`}
          </div>
        )}

      </footer>
    </div>
  );
};

export default Game;
