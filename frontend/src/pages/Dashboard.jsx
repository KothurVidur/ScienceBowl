import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { gameAPI, userAPI } from '../services/api';
import { FiPlay, FiCpu, FiBookOpen, FiTrendingUp, FiAward, FiTarget, FiClock } from 'react-icons/fi';
import Button from '../components/Button';
import Card from '../components/Card';
import styles from './Dashboard.module.css';
const Dashboard = () => {
  const {
    user
  } = useAuth();
  const {
    queueStats,
    isConnected
  } = useSocket();
  const [stats, setStats] = useState(null);
  const [recentGames, setRecentGames] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, gamesRes] = await Promise.all([userAPI.getStats(user.username), userAPI.getGames(user.username, 1)]);
        setStats(statsRes.data.data);
        setRecentGames(gamesRes.data.data.games.slice(0, 3));
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    if (user?.username) {
      fetchData();
    }
  }, [user]);
  const getRankColor = rating => {
    if (rating >= 2400) return '#ffd700';
    if (rating >= 2200) return '#c0c0c0';
    if (rating >= 2000) return '#cd7f32';
    if (rating >= 1800) return '#8b5cf6';
    if (rating >= 1600) return '#3b82f6';
    if (rating >= 1400) return '#10b981';
    return '#64748b';
  };
  const getRankTitle = rating => {
    if (rating >= 2400) return 'Grandmaster';
    if (rating >= 2200) return 'Master';
    if (rating >= 2000) return 'Expert';
    if (rating >= 1800) return 'Class A';
    if (rating >= 1600) return 'Class B';
    if (rating >= 1400) return 'Class C';
    if (rating >= 1200) return 'Class D';
    return 'Beginner';
  };
  if (loading) {
    return <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading dashboard...</p>
      </div>;
  }
  return <div className={styles.dashboard}>
      {}
      <header className={styles.header}>
        <div className={styles.greeting}>
          {}
          <h1>Welcome back, <span className={styles.username}>{user?.displayName || user?.username}</span></h1>
          <p className={styles.subtitle}>Pick your mode, warm up fast, and keep your rating climbing.</p>
          <p className={styles.statusLine}>
            {isConnected ? 'Live connection active' : 'Reconnecting...'}
            {' • '}
            {queueStats.playersInQueue || 0} players currently searching
          </p>
        </div>

        {}
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

      {}
      <section className={styles.statsSection}>
        {}
        <Card className={styles.ratingCard} glow>
          <div className={styles.ratingContent}>
            <div className={styles.ratingInfo}>
              <span className={styles.ratingLabel}>Current Rating</span>
              <span className={styles.ratingValue} style={{
              color: getRankColor(user?.rating || 1200)
            }}>

                {user?.rating || 1200}
              </span>
              <span className={styles.rankTitle} style={{
              color: getRankColor(user?.rating || 1200)
            }}>

                {getRankTitle(user?.rating || 1200)}
              </span>
            </div>
            <div className={styles.ratingChart}>
              <FiTrendingUp size={48} style={{
              color: getRankColor(user?.rating || 1200)
            }} />
            </div>
          </div>
          {}
          {stats?.peakRating && <div className={styles.peakRating}>
              Peak: <strong>{stats.peakRating}</strong>
            </div>}
        </Card>

        {}
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

      {}
      <div className={styles.mainContent}>
        {}
        <section className={styles.playSection}>
          <h2 className={styles.sectionTitle}>Play Now</h2>
          <div className={styles.playOptions}>
            <Link to="/play?mode=ranked" className={styles.playOption}>
              <Card hoverable className={styles.playCard}>
                <div className={styles.playIcon} style={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)'
              }}>
                  <FiPlay size={24} />
                </div>
                <h3>Ranked Match</h3>
                <p>Compete against real players and climb the leaderboard</p>
                {}
                <div className={styles.queueInfo}>
                  <span className={styles.onlineIndicator}></span>
                  {queueStats.playersInQueue || 0} in queue
                </div>
              </Card>
            </Link>

            <Link to="/play?mode=ai" className={styles.playOption}>
              <Card hoverable className={styles.playCard}>
                <div className={styles.playIcon} style={{
                background: 'linear-gradient(135deg, #06b6d4, #10b981)'
              }}>
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
                <div className={styles.playIcon} style={{
                background: 'linear-gradient(135deg, #f59e0b, #ef4444)'
              }}>
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

        {}
        <section className={styles.recentSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Games</h2>
            {}
            <Link to={`/profile/${user?.username}`} className={styles.viewAll}>
              View All
            </Link>
          </div>

          {}
          {recentGames.length > 0 ? <div className={styles.recentGames}>
              {}
              {recentGames.map(game => {
            const isPlayer1 = game.player1.userId === user?.id;
            const playerScore = isPlayer1 ? game.score.player1 : game.score.player2;
            const opponentScore = isPlayer1 ? game.score.player2 : game.score.player1;
            const opponentName = isPlayer1 ? game.player2?.username || 'AI' : game.player1.username;
            const won = isPlayer1 && game.winner === 'player1' || !isPlayer1 && game.winner === 'player2';
            const ratingChange = isPlayer1 ? game.player1.ratingChange : game.player2?.ratingChange;
            return <Link key={game._id} to={`/games/${game._id}/review`} className={styles.gameLink}>
                    <div className={`${styles.gameItem} ${won ? styles.won : game.winner === 'tie' ? styles.tie : styles.lost}`}>

                      <div className={styles.gameResult}>
                        {won ? 'W' : game.winner === 'tie' ? 'T' : 'L'}
                      </div>
                      <div className={styles.gameInfo}>
                        <span className={styles.opponent}>vs {opponentName}</span>
                        <span className={styles.score}>{playerScore} - {opponentScore}</span>
                      </div>
                      {ratingChange && <div className={`${styles.ratingChange} ${ratingChange > 0 ? styles.positive : styles.negative}`}>
                          {ratingChange > 0 ? '+' : ''}{ratingChange}
                        </div>}
                    </div>
                  </Link>;
          })}
            </div> : <Card className={styles.emptyState}>
              <p>No games played yet. Start a match to see your history!</p>
              <Link to="/play">
                <Button variant="primary" icon={<FiPlay />}>
                  Play Now
                </Button>
              </Link>
            </Card>}
        </section>
      </div>

      {}
      <div className={`${styles.connectionBanner} ${isConnected ? styles.connected : styles.disconnected}`}>
        <span className={styles.statusDot}></span>
        {isConnected ? 'Connected to game server' : 'Connecting to server...'}
      </div>
    </div>;
};
export default Dashboard;
