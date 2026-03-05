/**
 * ============================================================================
 * DASHBOARD.JSX - USER DASHBOARD PAGE
 * ============================================================================
 * 
 * This is the main page users see after logging in.
 * It demonstrates many important React patterns:
 * 
 * 1. DATA FETCHING WITH USEEFFECT
 *    - Fetch data when component mounts
 *    - Handle loading and error states
 * 
 * 2. MULTIPLE STATE VARIABLES
 *    - stats, recentGames, loading
 * 
 * 3. CONDITIONAL RENDERING
 *    - Show loading spinner while fetching
 *    - Show empty state if no games
 *    - Dynamic CSS classes based on state
 * 
 * 4. LIST RENDERING WITH .map()
 *    - Render recent games dynamically
 * 
 * 5. CONTEXT CONSUMERS
 *    - useAuth() for user data
 *    - useSocket() for real-time queue stats
 * 
 * 6. COMPONENT COMPOSITION
 *    - Using Card, Button components
 *    - Using Link for navigation
 * 
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

// Context hooks for global state
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

// API service for data fetching
import { gameAPI, userAPI } from '../services/api';

// Icons from react-icons library (Feather icons)
import { FiPlay, FiCpu, FiBookOpen, FiTrendingUp, FiAward, FiTarget, FiClock } from 'react-icons/fi';

// Reusable UI components
import Button from '../components/Button';
import Card from '../components/Card';

// CSS Modules for scoped styles
import styles from './Dashboard.module.css';

/**
 * DASHBOARD COMPONENT
 * 
 * Arrow function syntax for component definition.
 * Both arrow and regular functions work; this is a matter of preference.
 */
const Dashboard = () => {
  /**
   * ============================================================================
   * HOOKS - Must be called at the top level, unconditionally
   * ============================================================================
   */

  /**
   * CONTEXT: Get authenticated user
   * 
   * useAuth() returns the value from AuthContext.Provider.
   * We destructure just the 'user' object we need.
   */
  const { user } = useAuth();
  
  /**
   * CONTEXT: Get socket/real-time info
   * 
   * queueStats: How many players are searching for games
   * isConnected: Whether we're connected to the WebSocket server
   */
  const { queueStats, isConnected } = useSocket();
  
  /**
   * STATE: User statistics
   * 
   * Initially null - will be populated by API call.
   * null vs {} matters for conditional checks: if (stats) { ... }
   */
  const [stats, setStats] = useState(null);
  
  /**
   * STATE: Recent games list
   * 
   * Array of game objects. Start with empty array.
   * Empty array is falsy in conditionals: if (recentGames.length) { ... }
   */
  const [recentGames, setRecentGames] = useState([]);
  
  /**
   * STATE: Loading indicator
   * 
   * Starts true because we immediately start fetching data.
   * Set to false when data fetch completes (success or error).
   */
  const [loading, setLoading] = useState(true);

  /**
   * ============================================================================
   * DATA FETCHING WITH USEEFFECT
   * ============================================================================
   * 
   * useEffect runs code AFTER the component renders.
   * Perfect for side effects like API calls.
   * 
   * WHY USEEFFECT FOR API CALLS?
   * - React renders UI first (shows loading state)
   * - Effect runs after render (fetches data)
   * - Data arrives → setState → triggers re-render
   * - Re-render shows the data
   * 
   * This pattern ensures the UI is responsive while data loads.
   */
  useEffect(() => {
    /**
     * ASYNC FUNCTION INSIDE USEEFFECT
     * 
     * useEffect callback can't be async directly.
     * Pattern: Define async function inside, then call it.
     */
    const fetchData = async () => {
      try {
        /**
         * PARALLEL API CALLS WITH PROMISE.ALL
         * 
         * Promise.all() runs multiple promises in parallel.
         * Faster than sequential: await api1(); await api2();
         * 
         * Returns an array of results in the same order.
         * [statsRes, gamesRes] = await Promise.all([statsCall, gamesCall])
         * 
         * If ANY promise fails, the whole Promise.all fails.
         * Use Promise.allSettled() if you want to handle partial failures.
         */
        const [statsRes, gamesRes] = await Promise.all([
          userAPI.getStats(user.username),
          userAPI.getGames(user.username, 1)  // Page 1
        ]);
        
        /**
         * UPDATE STATE WITH FETCHED DATA
         * 
         * Each setState triggers a re-render.
         * React batches multiple setStates in the same event handler.
         */
        setStats(statsRes.data.data);
        // .slice(0, 3) gets first 3 games only
        setRecentGames(gamesRes.data.data.games.slice(0, 3));
      } catch (err) {
        // Log error but don't crash the app
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        /**
         * FINALLY BLOCK
         * 
         * Runs whether try succeeded or caught an error.
         * Perfect for cleanup that should always happen.
         * Here: always stop showing loading spinner.
         */
        setLoading(false);
      }
    };

    /**
     * CONDITIONAL FETCH
     * 
     * Only fetch if user exists and has a username.
     * Optional chaining: user?.username
     * Returns undefined (falsy) if user is null/undefined.
     */
    if (user?.username) {
      fetchData();
    }
  }, [user]);  // Dependency array: re-run effect if user changes

  /**
   * ============================================================================
   * HELPER FUNCTIONS
   * ============================================================================
   * 
   * These functions compute values based on props/state.
   * Defined inside the component so they have access to component scope.
   */

  /**
   * Get color for rating display
   * Higher ratings get "better" colors (gold, silver, etc.)
   */
  const getRankColor = (rating) => {
    if (rating >= 2400) return '#ffd700'; // Gold
    if (rating >= 2200) return '#c0c0c0'; // Silver
    if (rating >= 2000) return '#cd7f32'; // Bronze
    if (rating >= 1800) return '#8b5cf6'; // Purple
    if (rating >= 1600) return '#3b82f6'; // Blue
    if (rating >= 1400) return '#10b981'; // Green
    return '#64748b'; // Gray
  };

  /**
   * Get rank title for rating
   * Similar to chess titles (Grandmaster, Master, etc.)
   */
  const getRankTitle = (rating) => {
    if (rating >= 2400) return 'Grandmaster';
    if (rating >= 2200) return 'Master';
    if (rating >= 2000) return 'Expert';
    if (rating >= 1800) return 'Class A';
    if (rating >= 1600) return 'Class B';
    if (rating >= 1400) return 'Class C';
    if (rating >= 1200) return 'Class D';
    return 'Beginner';
  };

  /**
   * ============================================================================
   * CONDITIONAL RENDERING: LOADING STATE
   * ============================================================================
   * 
   * EARLY RETURN PATTERN:
   * If loading, return loading UI immediately.
   * Rest of the component doesn't run.
   * 
   * This is cleaner than wrapping everything in:
   * {loading ? <Loading /> : <ActualContent />}
   */
  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  /**
   * ============================================================================
   * MAIN RENDER
   * ============================================================================
   */
  return (
    <div className={styles.dashboard}>
      {/**
       * HEADER SECTION
       * 
       * Shows greeting and quick action buttons.
       */}
      <header className={styles.header}>
        <div className={styles.greeting}>
          {/**
           * DYNAMIC TEXT
           * 
           * {user?.displayName || user?.username}
           * - Shows displayName if it exists
           * - Falls back to username
           * - || is "OR" - uses right side if left is falsy
           */}
          <h1>Welcome back, <span className={styles.username}>{user?.displayName || user?.username}</span></h1>
          <p className={styles.subtitle}>Pick your mode, warm up fast, and keep your rating climbing.</p>
          <p className={styles.statusLine}>
            {isConnected ? 'Live connection active' : 'Reconnecting...'}
            {' • '}
            {queueStats.playersInQueue || 0} players currently searching
          </p>
        </div>

        {/**
         * QUICK ACTIONS
         * 
         * <Link> from react-router-dom creates navigation links.
         * Unlike <a href>, Link doesn't reload the page.
         * It uses client-side routing for instant navigation.
         */}
        <div className={styles.quickActions}>
          <Link to="/play">
            <Button variant="primary" size="lg" icon={<FiPlay />}>
              Find Match
            </Button>
          </Link>
          <Link to="/practice">
            <Button variant="secondary" size="lg" icon={<FiBookOpen />}>
              Practice
            </Button>
          </Link>
        </div>
      </header>

      {/**
       * STATS GRID SECTION
       * 
       * Displays user's key statistics in cards.
       */}
      <section className={styles.statsSection}>
        {/**
         * RATING CARD
         * 
         * INLINE STYLES:
         * style={{ color: getRankColor(...) }}
         * Used when styles depend on runtime values.
         * 
         * For static styles, CSS classes are preferred.
         */}
        <Card className={styles.ratingCard} glow>
          <div className={styles.ratingContent}>
            <div className={styles.ratingInfo}>
              <span className={styles.ratingLabel}>Current Rating</span>
              <span 
                className={styles.ratingValue}
                style={{ color: getRankColor(user?.rating || 1200) }}
              >
                {user?.rating || 1200}
              </span>
              <span 
                className={styles.rankTitle}
                style={{ color: getRankColor(user?.rating || 1200) }}
              >
                {getRankTitle(user?.rating || 1200)}
              </span>
            </div>
            <div className={styles.ratingChart}>
              <FiTrendingUp size={48} style={{ color: getRankColor(user?.rating || 1200) }} />
            </div>
          </div>
          {/**
           * CONDITIONAL RENDERING WITH &&
           * 
           * {condition && <JSX />}
           * - If condition is truthy, render JSX
           * - If condition is falsy, render nothing
           * 
           * Only show peak rating if it exists.
           */}
          {stats?.peakRating && (
            <div className={styles.peakRating}>
              Peak: <strong>{stats.peakRating}</strong>
            </div>
          )}
        </Card>

        {/* Quick stat cards */}
        <Card className={styles.statCard}>
          <div className={styles.statIcon}>
            <FiAward />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{stats?.stats?.gamesWon || 0}</span>
            <span className={styles.statLabel}>Games Won</span>
          </div>
        </Card>

        <Card className={styles.statCard}>
          <div className={styles.statIcon}>
            <FiTarget />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{stats?.stats?.accuracy || 0}%</span>
            <span className={styles.statLabel}>Accuracy</span>
          </div>
        </Card>

        <Card className={styles.statCard}>
          <div className={styles.statIcon}>
            <FiClock />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{stats?.stats?.gamesPlayed || 0}</span>
            <span className={styles.statLabel}>Games Played</span>
          </div>
        </Card>
      </section>

      {/* Main content area */}
      <div className={styles.mainContent}>
        {/**
         * PLAY OPTIONS SECTION
         * 
         * Cards for different game modes.
         * Uses query parameters: /play?mode=ranked
         */}
        <section className={styles.playSection}>
          <h2 className={styles.sectionTitle}>Play Now</h2>
          <div className={styles.playOptions}>
            <Link to="/play?mode=ranked" className={styles.playOption}>
              <Card hoverable className={styles.playCard}>
                <div className={styles.playIcon} style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                  <FiPlay size={24} />
                </div>
                <h3>Ranked Match</h3>
                <p>Compete against real players and climb the leaderboard</p>
                {/**
                 * LIVE DATA: Queue stats from WebSocket
                 * 
                 * queueStats comes from SocketContext.
                 * Updates in real-time as players join/leave queue.
                 */}
                <div className={styles.queueInfo}>
                  <span className={styles.onlineIndicator}></span>
                  {queueStats.playersInQueue || 0} in queue
                </div>
              </Card>
            </Link>

            <Link to="/play?mode=ai" className={styles.playOption}>
              <Card hoverable className={styles.playCard}>
                <div className={styles.playIcon} style={{ background: 'linear-gradient(135deg, #06b6d4, #10b981)' }}>
                  <FiCpu size={24} />
                </div>
                <h3>vs AI</h3>
                <p>Practice against AI opponents of varying difficulty</p>
                <div className={styles.aiLevels}>
                  Adaptive difficulties
                </div>
              </Card>
            </Link>

            <Link to="/practice" className={styles.playOption}>
              <Card hoverable className={styles.playCard}>
                <div className={styles.playIcon} style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>
                  <FiBookOpen size={24} />
                </div>
                <h3>Practice Mode</h3>
                <p>No pressure - practice questions at your own pace</p>
                <div className={styles.categoryCount}>
                  6 Categories Available
                </div>
              </Card>
            </Link>
          </div>
        </section>

        {/**
         * RECENT GAMES SECTION
         * 
         * Shows last 5 games or empty state.
         */}
        <section className={styles.recentSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Games</h2>
            {/**
             * TEMPLATE LITERAL IN JSX
             * 
             * {`/profile/${user?.username}`}
             * Creates dynamic URL: "/profile/john"
             */}
            <Link to={`/profile/${user?.username}`} className={styles.viewAll}>
              View All
            </Link>
          </div>
          
          {/**
           * CONDITIONAL RENDERING: LIST OR EMPTY STATE
           * 
           * TERNARY EXPRESSION:
           * condition ? ifTrue : ifFalse
           * 
           * If games exist, render the list.
           * Otherwise, render empty state message.
           */}
          {recentGames.length > 0 ? (
            <div className={styles.recentGames}>
              {/**
               * ============================================================================
               * LIST RENDERING WITH .map()
               * ============================================================================
               * 
               * Array.map() transforms each item into JSX.
               * 
               * [game1, game2, game3].map(game => <GameItem />)
               * Produces: [<GameItem />, <GameItem />, <GameItem />]
               * 
               * React renders arrays of JSX elements.
               * 
               * KEY PROP:
               * key={game._id} helps React track which items changed.
               * Must be unique among siblings.
               * Don't use array index as key (breaks with reordering).
               */}
              {recentGames.map((game) => {
                /**
                 * COMPUTED VALUES IN MAP
                 * 
                 * Calculate derived data inside map function.
                 * These run for each game item.
                 */
                const isPlayer1 = game.player1.userId === user?.id;
                const playerScore = isPlayer1 ? game.score.player1 : game.score.player2;
                const opponentScore = isPlayer1 ? game.score.player2 : game.score.player1;
                const opponentName = isPlayer1 
                  ? (game.player2?.username || 'AI') 
                  : game.player1.username;
                const won = (isPlayer1 && game.winner === 'player1') || (!isPlayer1 && game.winner === 'player2');
                const ratingChange = isPlayer1 ? game.player1.ratingChange : game.player2?.ratingChange;

                return (
                  <Link key={game._id} to={`/games/${game._id}/review`} className={styles.gameLink}>
                    <div
                      /**
                       * DYNAMIC CLASS NAMES
                       * 
                       * Template literal builds class string based on conditions.
                       * ${styles.gameItem} is always included.
                       * ${won ? styles.won : ...} adds conditional class.
                       */
                      className={`${styles.gameItem} ${won ? styles.won : game.winner === 'tie' ? styles.tie : styles.lost}`}
                    >
                      <div className={styles.gameResult}>
                        {won ? 'W' : game.winner === 'tie' ? 'T' : 'L'}
                      </div>
                      <div className={styles.gameInfo}>
                        <span className={styles.opponent}>vs {opponentName}</span>
                        <span className={styles.score}>{playerScore} - {opponentScore}</span>
                      </div>
                      {ratingChange && (
                        <div className={`${styles.ratingChange} ${ratingChange > 0 ? styles.positive : styles.negative}`}>
                          {ratingChange > 0 ? '+' : ''}{ratingChange}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            /**
             * EMPTY STATE
             * 
             * Shown when there's no data.
             * Good UX: Tell users what's missing and what to do.
             */
            <Card className={styles.emptyState}>
              <p>No games played yet. Start a match to see your history!</p>
              <Link to="/play">
                <Button variant="primary" icon={<FiPlay />}>
                  Play Now
                </Button>
              </Link>
            </Card>
          )}
        </section>
      </div>

      {/**
       * CONNECTION STATUS BANNER
       * 
       * Shows WebSocket connection status.
       * Dynamic class based on isConnected state.
       */}
      <div className={`${styles.connectionBanner} ${isConnected ? styles.connected : styles.disconnected}`}>
        <span className={styles.statusDot}></span>
        {isConnected ? 'Connected to game server' : 'Connecting to server...'}
      </div>
    </div>
  );
};

export default Dashboard;
