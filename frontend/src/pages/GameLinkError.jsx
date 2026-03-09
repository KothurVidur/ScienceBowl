import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiAlertTriangle, FiHome } from 'react-icons/fi';
import Button from '../components/Button';
import styles from './GameLinkError.module.css';
const GameLinkError = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const reason = params.get('reason') || 'invalid';
  const gameCode = params.get('gameCode') || '';
  const errorMessage = useMemo(() => {
    if (reason === 'expired') {
      return 'This game has expired or is no longer active.';
    }
    return 'This game link is invalid or no longer available.';
  }, [reason]);
  useEffect(() => {
    const redirectTimer = setTimeout(() => navigate('/dashboard', {
      replace: true
    }), 3000);
    return () => clearTimeout(redirectTimer);
  }, [navigate]);
  return <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.iconWrap}>
          <FiAlertTriangle />
        </div>
        <h1>Unable to Open Game</h1>
        <p>{errorMessage}</p>
        {gameCode && <p className={styles.meta}>Game Code: <strong>{gameCode}</strong></p>}
        <p className={styles.redirect}>Redirecting to dashboard...</p>
        <Button variant="primary" icon={<FiHome />} onClick={() => navigate('/dashboard', {
        replace: true
      })}>
          Go to Dashboard
        </Button>
      </div>
    </div>;
};
export default GameLinkError;
