import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  FiActivity,
  FiAward,
  FiCalendar,
  FiClock,
  FiCpu,
  FiGlobe,
  FiHash,
  FiPercent,
  FiTarget,
  FiTrendingUp,
  FiZap
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { userAPI } from '../services/api';
import Card from '../components/Card';
import styles from './Profile.module.css';

const Profile = () => {
  const { username } = useParams();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [games, setGames] = useState([]);
  const [ratingHistory, setRatingHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingRatingHistory, setLoadingRatingHistory] = useState(false);
  const [loadingGames, setLoadingGames] = useState(false);
  const [ratingRange, setRatingRange] = useState('30d');
  const [gamesRange, setGamesRange] = useState('10');
  const [ratedFilter, setRatedFilter] = useState('all');
  const hasCompletedInitialLoadRef = useRef(false);

  const isOwnProfile = currentUser?.username === username;

  const ratingRangeOptions = [
    { id: '30d', label: '30-Day', days: 30 },
    { id: '1y', label: '1-Year', days: 365 },
    { id: 'all', label: 'All-Time', days: 'all' }
  ];

  const gamesRangeOptions = [
    { id: 'all', label: 'All', limit: 'all' },
    { id: '10', label: '10', limit: 10 },
    { id: '100', label: '100', limit: 100 },
    { id: '1000', label: '1000', limit: 1000 }
  ];

  const ratedFilterOptions = [
    { id: 'all', label: 'All' },
    { id: 'rated', label: 'Rated' },
    { id: 'unrated', label: 'Unrated' }
  ];

  useEffect(() => {
    const fetchProfileData = async () => {
      hasCompletedInitialLoadRef.current = false;
      setLoading(true);
      try {
        const selectedRatingRange = ratingRangeOptions.find((range) => range.id === ratingRange) || ratingRangeOptions[0];
        const selectedGamesRange = gamesRangeOptions.find((range) => range.id === gamesRange) || gamesRangeOptions[0];

        const [profileRes, statsRes, gamesRes, historyRes] = await Promise.all([
          userAPI.getProfile(username),
          userAPI.getStats(username),
          userAPI.getGames(username, { page: 1, limit: selectedGamesRange.limit }),
          userAPI.getRatingHistory(username, selectedRatingRange.days)
        ]);

        setProfile(profileRes?.data?.data?.user || null);
        setStats(statsRes?.data?.data || null);
        setGames(gamesRes?.data?.data?.games || []);
        setRatingHistory(historyRes?.data?.data?.history || []);
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        hasCompletedInitialLoadRef.current = true;
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [username]);

  useEffect(() => {
    if (!hasCompletedInitialLoadRef.current) return;
    let isCancelled = false;

    const fetchRatingHistory = async () => {
      setLoadingRatingHistory(true);
      try {
        const selectedRatingRange = ratingRangeOptions.find((range) => range.id === ratingRange) || ratingRangeOptions[0];
        const historyRes = await userAPI.getRatingHistory(username, selectedRatingRange.days);
        if (isCancelled) return;
        setRatingHistory(historyRes?.data?.data?.history || []);
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to load rating history:', err);
        }
      } finally {
        if (!isCancelled) {
          setLoadingRatingHistory(false);
        }
      }
    };

    fetchRatingHistory();
    return () => {
      isCancelled = true;
    };
  }, [username, ratingRange]);

  useEffect(() => {
    if (!hasCompletedInitialLoadRef.current) return;
    let isCancelled = false;

    const fetchGames = async () => {
      setLoadingGames(true);
      try {
        const selectedGamesRange = gamesRangeOptions.find((range) => range.id === gamesRange) || gamesRangeOptions[0];
        const gamesRes = await userAPI.getGames(username, { page: 1, limit: selectedGamesRange.limit });
        if (isCancelled) return;
        setGames(gamesRes?.data?.data?.games || []);
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to load games:', err);
        }
      } finally {
        if (!isCancelled) {
          setLoadingGames(false);
        }
      }
    };

    fetchGames();
    return () => {
      isCancelled = true;
    };
  }, [username, gamesRange]);

  const getRankColor = (rating) => {
    if (rating >= 2400) return '#b45309';
    if (rating >= 2200) return '#475569';
    if (rating >= 2000) return '#9a3412';
    if (rating >= 1800) return '#7c3aed';
    if (rating >= 1600) return '#1d4ed8';
    if (rating >= 1400) return '#0f766e';
    return '#64748b';
  };

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

  const safeFormatDate = (value, pattern = 'MMM d, yyyy') => {
    if (!value) return 'Unknown date';
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) return 'Unknown date';
    return format(parsedDate, pattern);
  };

  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      const isRated = game.gameType === 'ranked';
      const isAI = Boolean(game.player2?.isAI || game.gameType === 'ai');

      const ratedMatch = ratedFilter === 'all' || (ratedFilter === 'rated' ? isRated : !isRated);

      // Recent Games should only include human-played games.
      return ratedMatch && !isAI;
    });
  }, [games, ratedFilter]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={styles.notFound}>
        <h1>User not found</h1>
        <p>The user "{username}" does not exist.</p>
      </div>
    );
  }

  const profileId = String(profile.id || profile._id || '');
  const categoryStats = stats?.stats?.categoryStats || {};
  const canonicalCategoryRows = [
    { key: 'mathematics', label: 'Mathematics', color: '#7c3aed', icon: <FiHash /> },
    { key: 'physics', label: 'Physics', color: '#2563eb', icon: <FiZap /> },
    { key: 'chemistry', label: 'Chemistry', color: '#ea580c', icon: <FiActivity /> },
    { key: 'biology', label: 'Biology', color: '#16a34a', icon: <FiAward /> },
    { key: 'earthAndSpace', label: 'Earth and Space', color: '#0f766e', icon: <FiGlobe /> },
    { key: 'energy', label: 'Energy', color: '#ca8a04', icon: <FiCpu /> }
  ];

  return (
    <div className={styles.profile}>
      <header className={styles.hero}>
        <div className={styles.identityCard}>
          <div className={styles.avatar}>{profile.username?.[0]?.toUpperCase() || 'U'}</div>
          <div className={styles.identityContent}>
            <div className={styles.identityTopRow}>
              <h1>{profile.displayName || profile.username}</h1>
              {isOwnProfile && <span className={styles.selfTag}>Your Profile</span>}
            </div>
            <span className={styles.username}>@{profile.username}</span>
            {profile.bio && <p className={styles.bio}>{profile.bio}</p>}
            <div className={styles.meta}>
              <span>
                <FiCalendar />
                Joined {safeFormatDate(profile.createdAt, 'MMMM yyyy')}
              </span>
              <span>
                <FiClock />
                {stats?.stats?.gamesPlayed || 0} total games
              </span>
            </div>
          </div>
        </div>

        <div className={styles.ratingCard}>
          <p className={styles.ratingLabel}>Current Rating</p>
          <span className={styles.rating} style={{ color: getRankColor(profile.rating) }}>
            {profile.rating}
          </span>
          <span className={styles.rankTitle} style={{ color: getRankColor(profile.rating) }}>
            {getRankTitle(profile.rating)}
          </span>
          <p className={styles.peakInfo}>
            Peak: <strong>{stats?.peakRating || profile.rating}</strong>
          </p>
        </div>
      </header>

      <section className={styles.statsGrid}>
        <Card className={styles.statCard}>
          <FiAward className={styles.statIcon} />
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{stats?.stats?.gamesWon || 0}</span>
            <span className={styles.statLabel}>Games Won</span>
          </div>
        </Card>
        <Card className={styles.statCard}>
          <FiClock className={styles.statIcon} />
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{stats?.stats?.gamesPlayed || 0}</span>
            <span className={styles.statLabel}>Games Played</span>
          </div>
        </Card>
        <Card className={styles.statCard}>
          <FiPercent className={styles.statIcon} />
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{stats?.stats?.winRate || 0}%</span>
            <span className={styles.statLabel}>Win Rate</span>
          </div>
        </Card>
        <Card className={styles.statCard}>
          <FiTarget className={styles.statIcon} />
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{stats?.stats?.accuracy || 0}%</span>
            <span className={styles.statLabel}>Accuracy</span>
          </div>
        </Card>
        <Card className={styles.statCard}>
          <FiTrendingUp className={styles.statIcon} />
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{stats?.peakRating || profile.rating}</span>
            <span className={styles.statLabel}>Peak Rating</span>
          </div>
        </Card>
        <Card className={styles.statCard}>
          <FiAward className={styles.statIcon} />
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{stats?.stats?.longestWinStreak || 0}</span>
            <span className={styles.statLabel}>Best Streak</span>
          </div>
        </Card>
      </section>

      <Card className={styles.chartCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Rating History</h2>
            <p>Track progress across different time windows.</p>
          </div>
          <div className={styles.sectionTabs}>
            {ratingRangeOptions.map((option) => (
              <button
                key={option.id}
                className={`${styles.sectionTab} ${ratingRange === option.id ? styles.activeSectionTab : ''}`}
                onClick={() => setRatingRange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {loadingRatingHistory ? (
          <div className={styles.inlineLoader}>
            <div className={styles.inlineSpinner}></div>
            <p>Updating rating history...</p>
          </div>
        ) : ratingHistory.length > 1 ? (
          <div className={styles.chart}>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart
                data={ratingHistory.map((entry) => ({
                  date: safeFormatDate(entry.date, 'MMM d'),
                  rating: entry.rating
                }))}
              >
                <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                <Tooltip
                  cursor={{ stroke: 'rgba(113, 156, 206, 0.28)' }}
                  contentStyle={{
                    background: 'rgba(8, 16, 32, 0.96)',
                    border: '1px solid rgba(113, 156, 206, 0.3)',
                    borderRadius: '12px',
                    color: '#ecf6ff',
                    boxShadow: '0 10px 30px rgba(1, 8, 24, 0.55)'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="rating"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={{ fill: '#2563eb', r: 3 }}
                  activeDot={{ r: 5, fill: '#1d4ed8' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className={styles.emptyPanel}>Not enough games yet to render a chart.</div>
        )}
      </Card>

      <Card className={styles.categoryCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Category Performance</h2>
            <p>Performance split by the six official Science Bowl categories.</p>
          </div>
        </div>

        <div className={styles.categoryGrid}>
          {canonicalCategoryRows.map(({ key, label, color, icon }) => {
            const data = categoryStats[key] || { answered: 0, correct: 0 };
            const accuracy = data.answered > 0 ? Math.round((data.correct / data.answered) * 100) : 0;

            return (
              <div key={key} className={styles.categoryItem}>
                <div className={styles.categoryTop}>
                  <div className={styles.categoryIcon} style={{ backgroundColor: `${color}1f`, color }}>
                    {icon}
                  </div>
                  <div>
                    <h3>{label}</h3>
                    <p>
                      {data.correct} correct out of {data.answered} answered
                    </p>
                  </div>
                  <strong className={styles.categoryAccuracy}>{accuracy}%</strong>
                </div>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${accuracy}%`, backgroundColor: color }}></div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className={styles.gamesCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Recent Games</h2>
            <p>Click any game to open full review details.</p>
          </div>
        </div>

        <div className={styles.gamesFilterBar}>
          <div className={`${styles.sectionTabs} ${styles.gamesFilterGroupLeft}`}>
            {gamesRangeOptions.map((option) => (
              <button
                key={option.id}
                className={`${styles.sectionTab} ${gamesRange === option.id ? styles.activeSectionTab : ''}`}
                onClick={() => setGamesRange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className={`${styles.sectionTabs} ${styles.gamesFilterGroupMiddle}`}>
            {ratedFilterOptions.map((option) => (
              <button
                key={option.id}
                className={`${styles.sectionTab} ${ratedFilter === option.id ? styles.activeSectionTab : ''}`}
                onClick={() => setRatedFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

        </div>

        {loadingGames ? (
          <div className={styles.inlineLoader}>
            <div className={styles.inlineSpinner}></div>
            <p>Updating recent games...</p>
          </div>
        ) : filteredGames.length > 0 ? (
          <div className={styles.gamesList}>
            {filteredGames.map((game) => {
              const player1Id = String(game?.player1?.userId || '');
              const isPlayer1 = player1Id === profileId;
              const playerScore = isPlayer1 ? game?.score?.player1 ?? 0 : game?.score?.player2 ?? 0;
              const opponentScore = isPlayer1 ? game?.score?.player2 ?? 0 : game?.score?.player1 ?? 0;
              const opponentName = isPlayer1 ? game?.player2?.username || 'AI' : game?.player1?.username || 'Opponent';
              const won = (isPlayer1 && game.winner === 'player1') || (!isPlayer1 && game.winner === 'player2');
              const ratingChange = isPlayer1 ? game?.player1?.ratingChange : game?.player2?.ratingChange;

              return (
                <Link
                  key={game._id}
                  to={`/games/${game._id}/review?from=profile&u=${encodeURIComponent(username)}`}
                  state={{ fromProfile: true, profileUsername: username }}
                  className={styles.gameReviewLink}
                >
                  <article className={`${styles.gameItem} ${won ? styles.won : game.winner === 'tie' ? styles.tie : styles.lost}`}>
                    <div className={styles.resultBadge}>{won ? 'Win' : game.winner === 'tie' ? 'Tie' : 'Loss'}</div>
                    <div className={styles.gameInfo}>
                      <span className={styles.opponent}>vs {opponentName}</span>
                      <span className={styles.gameDate}>{safeFormatDate(game.createdAt, 'MMM d, yyyy')}</span>
                    </div>
                    <div className={styles.gameScore}>{playerScore} - {opponentScore}</div>
                    {typeof ratingChange === 'number' && (
                      <div className={`${styles.ratingChange} ${ratingChange >= 0 ? styles.positive : styles.negative}`}>
                        {ratingChange >= 0 ? '+' : ''}
                        {ratingChange}
                      </div>
                    )}
                  </article>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyPanel}>No games match these filters.</div>
        )}
      </Card>
    </div>
  );
};

export default Profile;
