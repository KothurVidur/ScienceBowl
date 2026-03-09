import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiClock, FiArrowLeft } from 'react-icons/fi';
import Button from '../components/Button';
import Card from '../components/Card';
import styles from './InProgress.module.css';
const InProgress = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const feature = searchParams.get('feature') || 'feature';
  return <div className={styles.wrapper}>
      <Card className={styles.card}>
        <div className={styles.iconWrap}>
          <FiClock size={30} />
        </div>
        <h1>In Progress</h1>
        <p>
          <strong>{feature}</strong> is temporarily disabled while it is being rebuilt.
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" icon={<FiArrowLeft />} onClick={() => navigate('/play')}>
            Back to Play
          </Button>
        </div>
      </Card>
    </div>;
};
export default InProgress;
