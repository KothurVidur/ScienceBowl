import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiTrendingUp } from 'react-icons/fi';
import { userAPI } from '../services/api';
import Card from '../components/Card';
import styles from './Leaderboard.module.css';

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        const response = await userAPI.getLeaderboard({ sortBy: 'rating', page, limit: 25 });
        setLeaderboard(response.data.data.leaderboard);
        setTotalPages(response.data.data.pagination.pages);
      } catch (err) {
        console.error('Failed to load leaderboard:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [page]);

  const averageRating = useMemo(() => {
    if (!leaderboard.length) return 0;
    const total = leaderboard.reduce((sum, player) => sum + Number(player.rating || 0), 0);
    return Math.round(total / leaderboard.length);
  }, [leaderboard]);

  const getRankColor = (rating) => {
    if (rating >= 2400) return '#b45309';
    if (rating >= 2200) return '#475569';
    if (rating >= 2000) return '#7c2d12';
    if (rating >= 1800) return '#7c3aed';
    if (rating >= 1600) return '#2563eb';
    if (rating >= 1400) return '#0f766e';
    return '#64748b';
  };

  return (
    <div className={styles.leaderboard}>
      <header className={styles.header}>
        <div>
          <h1>Leaderboard</h1>
          <p>Global rating standings</p>
        </div>
        <div className={styles.metaBadge}>
          <FiTrendingUp />
          Average on page: <strong>{averageRating}</strong>
        </div>
      </header>

      <Card className={styles.tableCard}>
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>Loading leaderboard...</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((player) => (
                  <tr key={player._id} className={player.rank <= 3 ? styles.topRank : ''}>
                    <td className={styles.rank}>
                      <span className={styles.rankBadge}>#{player.rank}</span>
                    </td>
                    <td>
                      <Link to={`/profile/${player.username}`} className={styles.playerLink}>
                        <div className={styles.avatar}>
                          {String(player.username || 'u').charAt(0).toUpperCase()}
                        </div>
                        <div className={styles.playerInfo}>
                          <span className={styles.displayName}>{player.displayName || player.username}</span>
                          <span className={styles.username}>@{player.username}</span>
                        </div>
                      </Link>
                    </td>
                    <td>
                      <span className={styles.rating} style={{ color: getRankColor(player.rating) }}>
                        {player.rating}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              Next
            </button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Leaderboard;
