import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { FiMenu, FiX, FiUser, FiLogOut, FiSettings, FiAward, FiPlay, FiHome, FiBookOpen, FiAperture } from 'react-icons/fi';
import styles from './Navbar.module.css';
const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const {
    user,
    isAuthenticated,
    logout
  } = useAuth();
  const {
    isConnected
  } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const handleLogout = () => {
    logout();
    navigate('/');
    setIsProfileOpen(false);
  };
  const isActive = path => location.pathname === path;
  return <nav className={styles.navbar}>
      <div className={styles.container}>
        {}
        <Link to={isAuthenticated ? '/dashboard' : '/'} className={styles.logo}>
          <span className={styles.logoIcon}><FiAperture /></span>
          <span className={styles.logoText}>ScienceBowlOne</span>
          <span className={styles.logoOnline}>Pro</span>
        </Link>

        {}
        <div className={styles.desktopNav}>
          {isAuthenticated ? <>
              <Link to="/dashboard" className={`${styles.navLink} ${isActive('/dashboard') ? styles.active : ''}`}>

                <FiHome />
                Dashboard
              </Link>
              <Link to="/play" className={`${styles.navLink} ${isActive('/play') ? styles.active : ''}`}>

                <FiPlay />
                Play
              </Link>
              <Link to="/practice" className={`${styles.navLink} ${isActive('/practice') ? styles.active : ''}`}>

                <FiBookOpen />
                Practice
              </Link>
              <Link to="/leaderboard" className={`${styles.navLink} ${isActive('/leaderboard') ? styles.active : ''}`}>

                <FiAward />
                Leaderboard
              </Link>
            </> : <>
              <Link to="/leaderboard" className={`${styles.navLink} ${isActive('/leaderboard') ? styles.active : ''}`}>

                <FiAward />
                Leaderboard
              </Link>
            </>}
        </div>

        {}
        <div className={styles.rightSection}>
          {isAuthenticated ? <>
              {}
              <div className={`${styles.connectionStatus} ${isConnected ? styles.connected : styles.disconnected}`}>
                <span className={styles.statusDot}></span>
                <span className={styles.statusText}>{isConnected ? 'Online' : 'Offline'}</span>
              </div>

              {}
              <div className={styles.profileDropdown}>
                <button className={styles.profileButton} onClick={() => setIsProfileOpen(!isProfileOpen)}>

                  <div className={styles.avatar}>
                    {user?.username?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <span className={styles.username}>{user?.username}</span>
                  <span className={styles.rating}>{user?.rating || 1200}</span>
                </button>

                {isProfileOpen && <div className={styles.dropdownMenu}>
                    <Link to={`/profile/${user?.username}`} className={styles.dropdownItem} onClick={() => setIsProfileOpen(false)}>

                      <FiUser />
                      Profile
                    </Link>
                    <Link to="/settings" className={styles.dropdownItem} onClick={() => setIsProfileOpen(false)}>

                      <FiSettings />
                      Settings
                    </Link>
                    <hr className={styles.divider} />
                    <button className={styles.dropdownItem} onClick={handleLogout}>

                      <FiLogOut />
                      Logout
                    </button>
                  </div>}
              </div>
            </> : <div className={styles.authButtons}>
              <Link to="/login" className={styles.loginButton}>
                Log In
              </Link>
              <Link to="/register" className={styles.signupButton}>
                Sign Up
              </Link>
            </div>}

          {}
          <button className={styles.menuToggle} onClick={() => setIsMenuOpen(!isMenuOpen)}>

            {isMenuOpen ? <FiX /> : <FiMenu />}
          </button>
        </div>
      </div>

      {}
      {isMenuOpen && <div className={styles.mobileMenu}>
          {isAuthenticated ? <>
              <Link to="/dashboard" className={styles.mobileLink} onClick={() => setIsMenuOpen(false)}>

                <FiHome />
                Dashboard
              </Link>
              <Link to="/play" className={styles.mobileLink} onClick={() => setIsMenuOpen(false)}>

                <FiPlay />
                Play
              </Link>
              <Link to="/practice" className={styles.mobileLink} onClick={() => setIsMenuOpen(false)}>

                <FiBookOpen />
                Practice
              </Link>
              <Link to="/leaderboard" className={styles.mobileLink} onClick={() => setIsMenuOpen(false)}>

                <FiAward />
                Leaderboard
              </Link>
              <Link to={`/profile/${user?.username}`} className={styles.mobileLink} onClick={() => setIsMenuOpen(false)}>

                <FiUser />
                Profile
              </Link>
              <Link to="/settings" className={styles.mobileLink} onClick={() => setIsMenuOpen(false)}>

                <FiSettings />
                Settings
              </Link>
              <button className={styles.mobileLink} onClick={handleLogout}>

                <FiLogOut />
                Logout
              </button>
            </> : <>
              <Link to="/leaderboard" className={styles.mobileLink} onClick={() => setIsMenuOpen(false)}>

                <FiAward />
                Leaderboard
              </Link>
              <Link to="/login" className={styles.mobileLink} onClick={() => setIsMenuOpen(false)}>

                Log In
              </Link>
              <Link to="/register" className={styles.mobileLink} onClick={() => setIsMenuOpen(false)}>

                Sign Up
              </Link>
            </>}
        </div>}
    </nav>;
};
export default Navbar;
