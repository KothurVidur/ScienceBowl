import { Link } from 'react-router-dom';
import { FiHome, FiArrowLeft } from 'react-icons/fi';
import Button from '../components/Button';
import styles from './NotFound.module.css';

const NotFound = () => {
  return (
    <div className={styles.notFound}>
      <div className={styles.content}>
        <div className={styles.errorCode}>404</div>
        <h1>Page Not Found</h1>
        <p>The page you're looking for doesn't exist or has been moved.</p>
        <div className={styles.actions}>
          <Link to="/">
            <Button variant="primary" icon={<FiHome />}>
              Go Home
            </Button>
          </Link>
          <Button 
            variant="secondary" 
            icon={<FiArrowLeft />}
            onClick={() => window.history.back()}
          >
            Go Back
          </Button>
        </div>
      </div>

      {/* Decorative elements */}
      <div className={styles.decoration}>
        <div className={styles.atom}>
          <div className={styles.nucleus}></div>
          <div className={styles.orbit}></div>
          <div className={styles.orbit}></div>
          <div className={styles.orbit}></div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
