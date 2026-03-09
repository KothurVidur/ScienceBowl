import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiZap, FiUsers, FiAward, FiCpu, FiArrowRight, FiHash, FiActivity, FiDroplet, FiGlobe, FiBatteryCharging, FiAperture, FiCheckCircle } from 'react-icons/fi';
import Button from '../components/Button';
import styles from './Home.module.css';
const Home = () => {
  const {
    isAuthenticated
  } = useAuth();
  const [counter, setCounter] = useState({
    questions: 0,
    matches: 0,
    players: 0
  });
  useEffect(() => {
    const start = Date.now();
    const durationMs = 1400;
    const targets = {
      questions: 10000,
      matches: 250000,
      players: 24000
    };
    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCounter({
        questions: Math.floor(targets.questions * eased),
        matches: Math.floor(targets.matches * eased),
        players: Math.floor(targets.players * eased)
      });
      if (progress >= 1) clearInterval(timer);
    }, 25);
    return () => clearInterval(timer);
  }, []);
  const features = [{
    icon: <FiZap />,
    title: 'Real-Time Match Engine',
    description: 'Authoritative server timing, low-latency buzz logic, and strict scoring flow.'
  }, {
    icon: <FiAward />,
    title: 'Competitive Rating',
    description: 'Track meaningful rating movement and profile trends over time.'
  }, {
    icon: <FiCpu />,
    title: 'AI Sparring',
    description: 'Train against configurable AI opponents when no live match is running.'
  }, {
    icon: <FiUsers />,
    title: 'Global Competition',
    description: 'Challenge players worldwide and review every question after each game.'
  }];
  const categories = [{
    name: 'Mathematics',
    icon: <FiHash />,
    color: '#7c3aed'
  }, {
    name: 'Physics',
    icon: <FiAperture />,
    color: '#2563eb'
  }, {
    name: 'Chemistry',
    icon: <FiDroplet />,
    color: '#f59e0b'
  }, {
    name: 'Biology',
    icon: <FiActivity />,
    color: '#10b981'
  }, {
    name: 'Earth and Space',
    icon: <FiGlobe />,
    color: '#0ea5e9'
  }, {
    name: 'Energy',
    icon: <FiBatteryCharging />,
    color: '#f97316'
  }];
  const testimonials = [{
    quote: 'The protest and review flow makes every result transparent.',
    by: 'Captain, Regional Team'
  }, {
    quote: 'Practice mode is fast enough to drill dozens of questions in one sitting.',
    by: 'National Finalist'
  }];
  return <div className={styles.home}>
      <section className={styles.hero}>
        <div className={styles.heroLayer} />
        <div className={styles.heroGrid}>
          <div className={styles.heroMain}>
            <div className={styles.kicker}>Science Bowl competition platform</div>
            <h1>
              Test Your Scientific
              <span className={styles.highlight}> Knowledge Under Pressure</span>
            </h1>
            <p className={styles.subtitle}>
              Compete in live Science Bowl rounds with strict buzz timing, tossup/bonus cycles,
              and detailed post-game review.
            </p>
            <div className={styles.heroActions}>
              {isAuthenticated ? <>
                  <Link to="/play">
                    <Button variant="primary" size="lg" icon={<FiZap />}>Play Live Match</Button>
                  </Link>
                  <Link to="/dashboard">
                    <Button variant="secondary" size="lg">Open Dashboard</Button>
                  </Link>
                </> : <>
                  <Link to="/register">
                    <Button variant="primary" size="lg" icon={<FiArrowRight />}>Create Free Account</Button>
                  </Link>
                  <Link to="/login">
                    <Button variant="secondary" size="lg">Sign In</Button>
                  </Link>
                </>}
            </div>
            <div className={styles.statRow}>
              <div>
                <strong>{counter.questions.toLocaleString()}+</strong>
                <span>Questions</span>
              </div>
              <div>
                <strong>{counter.matches.toLocaleString()}+</strong>
                <span>Rounds played</span>
              </div>
              <div>
                <strong>{counter.players.toLocaleString()}+</strong>
                <span>Registered users</span>
              </div>
            </div>
          </div>

          <aside className={styles.sampleCard}>
            <span className={styles.sampleLabel}>Sample Tossup</span>
            <p>
              This molecule has the empirical formula CH2O and is the first product of photosynthesis in many pathways.
              Name it.
            </p>
            <div className={styles.sampleAnswer}>
              <FiCheckCircle />
              Correct answer: <strong>Formaldehyde</strong>
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Science Categories</h2>
        <p>Official six-category coverage, each with progressive difficulty.</p>
        <div className={styles.categoryGrid}>
          {categories.map(category => <article key={category.name} className={styles.categoryCard} style={{
          '--cat-color': category.color
        }}>
              <span className={styles.categoryIcon}>{category.icon}</span>
              <span>{category.name}</span>
            </article>)}
        </div>
      </section>

      <section className={styles.section}>
        <h2>What Makes It Competitive</h2>
        <p>Built for actual gameplay rhythm, not just a static quiz experience.</p>
        <div className={styles.featureGrid}>
          {features.map(feature => <article key={feature.title} className={styles.featureCard}>
              <div className={styles.featureIcon}>{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>)}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Trust and Credibility</h2>
        <div className={styles.trustGrid}>
          {testimonials.map(item => <blockquote key={item.by} className={styles.quoteCard}>
              <p>{item.quote}</p>
              <cite>{item.by}</cite>
            </blockquote>)}
          <div className={styles.disclaimer}>
            <h3>Program Notice</h3>
            <p>
              Inspired by the DOE National Science Bowl format. This platform is independently developed and is not
              operated by, endorsed by, or affiliated with the U.S. Department of Energy.
            </p>
          </div>
        </div>
      </section>
    </div>;
};
export default Home;
