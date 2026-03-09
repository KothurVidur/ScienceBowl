import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { gameAPI } from '../services/api';
import { FiUsers, FiCpu, FiSearch, FiX, FiPlay, FiArrowLeft, FiTool } from 'react-icons/fi';
import Button from '../components/Button';
import Card from '../components/Card';
import toast from 'react-hot-toast';
import styles from './Play.module.css';
const Play = () => {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') || null;
  const autoQueueRequested = searchParams.get('autoQueue') === '1';
  const [mode, setMode] = useState(initialMode);
  const [aiDifficulty, setAiDifficulty] = useState('medium');
  const [isSearching, setIsSearching] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const createRequestInFlightRef = useRef(false);
  const autoQueueHandledRef = useRef(false);
  const queueModeConfig = {
    ranked: {
      queueType: 'ranked_1v1',
      title: 'Ranked Match',
      description: 'Compete for rating against similarly skilled players.'
    },
    unranked: {
      queueType: 'unranked_1v1',
      title: 'Unranked 1v1',
      description: 'Live 1v1 practice with no rating changes.'
    }
  };
  const {
    emit,
    on,
    isConnected,
    queueStats
  } = useSocket();
  const navigate = useNavigate();
  const getQueueCount = queueType => {
    return queueStats?.byQueue?.[queueType] ?? queueStats?.playersInQueue ?? 0;
  };
  useEffect(() => {
    if (mode === 'team_ranked' || mode === 'team_unranked') {
      navigate('/in-progress?feature=team-duel', {
        replace: true
      });
      return;
    }
    if (mode === 'private') {
      navigate('/in-progress?feature=private-match', {
        replace: true
      });
    }
  }, [mode, navigate]);
  useEffect(() => {
    const handleMatched = data => {
      toast.success('Match found!');
      navigate(`/game/${data.gameCode}`);
    };
    const handleError = data => {
      toast.error(data.message || 'Matchmaking error');
      setIsSearching(false);
    };
    const unsubMatched = on('matchmaking:matched', handleMatched);
    const unsubError = on('matchmaking:error', handleError);
    return () => {
      unsubMatched();
      unsubError();
    };
  }, [on, navigate]);
  useEffect(() => {
    let interval;
    if (isSearching) {
      interval = setInterval(() => {
        setSearchTime(prev => prev + 1);
      }, 1000);
    } else {
      setSearchTime(0);
    }
    return () => clearInterval(interval);
  }, [isSearching]);
  const handleStartQueueMatch = queueType => {
    if (!isConnected) {
      toast.error('Not connected to server');
      return;
    }
    setIsSearching(true);
    emit('matchmaking:join', {
      queueType
    });
  };
  const handleCancelSearch = () => {
    emit('matchmaking:leave');
    setIsSearching(false);
  };
  useEffect(() => {
    if (!autoQueueRequested) return;
    if (autoQueueHandledRef.current) return;
    if (!mode || !queueModeConfig[mode]) return;
    if (!isConnected || isSearching) return;
    autoQueueHandledRef.current = true;
    handleStartQueueMatch(queueModeConfig[mode].queueType);
  }, [autoQueueRequested, mode, isConnected, isSearching]);
  const handleStartAI = async () => {
    if (createRequestInFlightRef.current) return;
    createRequestInFlightRef.current = true;
    setIsCreatingGame(true);
    try {
      const response = await gameAPI.create({
        gameType: 'ai',
        aiDifficulty
      });
      const {
        gameCode
      } = response.data.data.game;
      navigate(`/game/${gameCode}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create game');
    } finally {
      createRequestInFlightRef.current = false;
      setIsCreatingGame(false);
    }
  };
  const formatTime = seconds => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  if (!mode) {
    return <div className={styles.play}>
        <header className={styles.modeHeader}>
          <h1 className={styles.title}>Choose Game Mode</h1>
          <p className={styles.subtitle}>Select how you want to compete right now.</p>
          <p className={styles.queueSummary}>
            Live queue: <strong>{queueStats.playersInQueue || 0}</strong> searching
          </p>
        </header>

        <div className={styles.modeGrid}>
          <Card hoverable className={styles.modeCard} onClick={() => setMode('ranked')}>
            <div className={styles.modeIcon} style={{
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)'
          }}>
              <FiUsers size={32} />
            </div>
            <h2>Ranked Match</h2>
            <p>Compete against real players. Win to gain rating, lose to drop.</p>
            <div className={styles.modeInfo}>
                <span className={styles.queueCount}>
                  <span className={styles.onlineDot}></span>
                  {getQueueCount('ranked_1v1')} in queue
                </span>
            </div>
          </Card>

          <Card hoverable className={styles.modeCard} onClick={() => setMode('unranked')}>
            <div className={styles.modeIcon} style={{
            background: 'linear-gradient(135deg, #0ea5e9, #22d3ee)'
          }}>
              <FiUsers size={32} />
            </div>
            <h2>Unranked 1v1</h2>
            <p>Instant 1v1 matchmaking with no rating changes.</p>
            <div className={styles.modeInfo}>
              <span className={styles.queueCount}>
                <span className={styles.onlineDot}></span>
                {getQueueCount('unranked_1v1')} in queue
              </span>
            </div>
          </Card>

          <Card hoverable className={styles.modeCard} onClick={() => setMode('ai')}>
            <div className={styles.modeIcon} style={{
            background: 'linear-gradient(135deg, #06b6d4, #10b981)'
          }}>
              <FiCpu size={32} />
            </div>
            <h2>vs AI</h2>
            <p>Practice against AI opponents. No rating changes.</p>
            <div className={styles.modeInfo}>
              <span>4 difficulty levels</span>
            </div>
          </Card>

          <Card hoverable className={styles.modeCard} onClick={() => navigate('/in-progress?feature=team-duel')}>
            <div className={styles.modeIcon} style={{
            background: 'linear-gradient(135deg, #f97316, #ef4444)'
          }}>
              <FiTool size={32} />
            </div>
            <h2>Ranked Team Duel</h2>
            <p>This mode is temporarily disabled while being rebuilt.</p>
            <div className={styles.modeInfo}>
              <span className={styles.modePill}>In Progress</span>
            </div>
          </Card>

          <Card hoverable className={styles.modeCard} onClick={() => navigate('/in-progress?feature=team-duel')}>
            <div className={styles.modeIcon} style={{
            background: 'linear-gradient(135deg, #f59e0b, #f97316)'
          }}>
              <FiTool size={32} />
            </div>
            <h2>Unranked Team Duel</h2>
            <p>This mode is temporarily disabled while being rebuilt.</p>
            <div className={styles.modeInfo}>
              <span className={styles.modePill}>In Progress</span>
            </div>
          </Card>

          <Card hoverable className={styles.modeCard} onClick={() => navigate('/in-progress?feature=private-match')}>
            <div className={styles.modeIcon} style={{
            background: 'linear-gradient(135deg, #f59e0b, #ef4444)'
          }}>
              <FiTool size={32} />
            </div>
            <h2>Private Match</h2>
            <p>This mode is temporarily disabled while being rebuilt.</p>
            <div className={styles.modeInfo}>
              <span className={styles.modePill}>In Progress</span>
            </div>
          </Card>
        </div>
      </div>;
  }
  if (queueModeConfig[mode]) {
    const queueConfig = queueModeConfig[mode];
    return <div className={styles.play}>
        <button className={styles.backButton} onClick={() => setMode(null)}>
          <FiArrowLeft /> Back
        </button>

        <Card className={styles.matchmakingCard}>
          {isSearching ? <div className={styles.searching}>
              <div className={styles.searchingAnimation}>
                <div className={styles.searchRing}></div>
                <div className={styles.searchRing}></div>
                <div className={styles.searchRing}></div>
                <FiUsers size={32} />
              </div>
              <h2>Finding Match...</h2>
              <p className={styles.searchTime}>{formatTime(searchTime)}</p>
              <p className={styles.searchInfo}>{getQueueCount(queueConfig.queueType)} players in queue</p>
              <Button variant="danger" onClick={handleCancelSearch} icon={<FiX />}>
                Cancel
              </Button>
            </div> : <div className={styles.readyToSearch}>
              <div className={styles.modeIcon} style={{
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)'
          }}>
                <FiUsers size={40} />
              </div>
              <h2>{queueConfig.title}</h2>
              <p>{queueConfig.description}</p>

              <ul className={styles.matchRules}>
                <li>10 toss-up cycles with bonus opportunities</li>
                <li>Toss-up scoring and penalties follow current game rules</li>
                <li>First valid buzz is accepted server-side</li>
                <li>End-of-cycle review includes ready/protest flow</li>
              </ul>

              <Button variant="primary" size="lg" onClick={() => handleStartQueueMatch(queueConfig.queueType)} disabled={!isConnected} icon={<FiSearch />}>

                Find Match
              </Button>
              {!isConnected && <p className={styles.connectionWarning}>Connecting to server...</p>}
            </div>}
        </Card>
      </div>;
  }
  if (mode === 'ai') {
    return <div className={styles.play}>
        <button className={styles.backButton} onClick={() => setMode(null)}>
          <FiArrowLeft /> Back
        </button>

        <Card className={styles.aiCard}>
          <div className={styles.modeIcon} style={{
          background: 'linear-gradient(135deg, #06b6d4, #10b981)'
        }}>
            <FiCpu size={40} />
          </div>
          <h2>Play vs AI</h2>
          <p>Choose your opponent's difficulty level</p>

          <div className={styles.difficultyGrid}>
            {['easy', 'medium', 'hard', 'expert'].map(diff => <button key={diff} className={`${styles.difficultyOption} ${aiDifficulty === diff ? styles.selected : ''}`} onClick={() => setAiDifficulty(diff)}>

                <span className={styles.difficultyName}>{diff.charAt(0).toUpperCase() + diff.slice(1)}</span>
                <span className={styles.difficultyDesc}>
                  {diff === 'easy' && 'Beginner-friendly'}
                  {diff === 'medium' && 'Balanced challenge'}
                  {diff === 'hard' && 'Tough competition'}
                  {diff === 'expert' && 'Near-perfect play'}
                </span>
              </button>)}
          </div>

          <Button variant="cyan" size="lg" onClick={handleStartAI} disabled={isCreatingGame} icon={<FiPlay />}>
            {isCreatingGame ? 'Starting...' : 'Start Game'}
          </Button>
        </Card>
      </div>;
  }
  return null;
};
export default Play;
