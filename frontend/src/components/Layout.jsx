import Navbar from './Navbar';
import styles from './Layout.module.css';

const Layout = ({ children }) => {
  return (
    <div className={styles.layout}>
      <Navbar />
      <main className={styles.main}>
        {children}
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <p>&copy; 2026 Science Bowl Online. Inspired by the DOE National Science Bowl.</p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
