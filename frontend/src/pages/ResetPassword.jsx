import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FiLock, FiArrowRight } from 'react-icons/fi';
import { authAPI } from '../services/api';
import Button from '../components/Button';
import Input from '../components/Input';
import toast from 'react-hot-toast';
import styles from './Auth.module.css';

/**
 * Reset Password page
 *
 * Consumes token from URL and sets a new password.
 */
const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  const { token } = useParams();
  const navigate = useNavigate();

  const validate = () => {
    const nextErrors = {};

    if (!password) {
      nextErrors.password = 'Password is required';
    } else if (password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters';
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      nextErrors.password = 'Password needs uppercase, lowercase, and number';
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = 'Please confirm password';
    } else if (confirmPassword !== password) {
      nextErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token || !validate()) return;

    setLoading(true);
    try {
      await authAPI.resetPassword(token, { password });
      setCompleted(true);
      toast.success('Password reset successful');

      // Redirect shortly so users can log in immediately
      setTimeout(() => navigate('/login', { replace: true }), 1200);
    } catch (err) {
      const message = err.response?.data?.error || 'Could not reset password';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.authPage}>
      <div className={styles.authContainer}>
        <div className={styles.authCard}>
          <Link to="/" className={styles.logo}>
            <span className={styles.logoIcon}>⚗️</span>
            <span className={styles.logoText}>Science Bowl Online</span>
          </Link>

          <h1 className={styles.title}>Reset Password</h1>
          <p className={styles.subtitle}>
            Choose a new password for your account.
          </p>

          {!completed ? (
            <form onSubmit={handleSubmit} className={styles.form}>
              <Input
                label="New Password"
                type="password"
                name="password"
                placeholder="Enter new password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors(prev => ({ ...prev, password: '' }));
                }}
                error={errors.password}
                icon={<FiLock />}
              />

              <Input
                label="Confirm Password"
                type="password"
                name="confirmPassword"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword) setErrors(prev => ({ ...prev, confirmPassword: '' }));
                }}
                error={errors.confirmPassword}
                icon={<FiLock />}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                icon={<FiArrowRight />}
                disabled={!token}
              >
                Reset Password
              </Button>
            </form>
          ) : (
            <div className={styles.successBox}>
              Password updated successfully. Redirecting to login...
            </div>
          )}

          <p className={styles.switchText}>
            Back to{' '}
            <Link to="/login" className={styles.switchLink}>
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
