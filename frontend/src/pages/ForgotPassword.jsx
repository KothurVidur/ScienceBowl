import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiMail, FiArrowRight } from 'react-icons/fi';
import { authAPI } from '../services/api';
import Button from '../components/Button';
import Input from '../components/Input';
import toast from 'react-hot-toast';
import styles from './Auth.module.css';
const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resetUrl, setResetUrl] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [deliveryReason, setDeliveryReason] = useState('');
  const validate = () => {
    if (!email) {
      setError('Email is required');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email');
      return false;
    }
    setError('');
    return true;
  };
  const handleSubmit = async e => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const response = await authAPI.forgotPassword({
        email
      });
      const maybeResetUrl = response.data?.data?.resetUrl;
      const wasEmailSent = Boolean(response.data?.data?.emailSent);
      const fallbackReason = response.data?.data?.deliveryReason || '';
      setSubmitted(true);
      setResetUrl(maybeResetUrl || '');
      setEmailSent(wasEmailSent);
      setDeliveryReason(fallbackReason);
      toast.success('If the account exists, password reset instructions are ready.');
    } catch (err) {
      const message = err.response?.data?.error || 'Unable to request password reset';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };
  return <div className={styles.authPage}>
      <div className={styles.authContainer}>
        <div className={styles.authCard}>
          <Link to="/" className={styles.logo}>
            <span className={styles.logoIcon}>⚗️</span>
            <span className={styles.logoText}>ScienceBowlOne</span>
          </Link>

          <h1 className={styles.title}>Forgot Password</h1>
          <p className={styles.subtitle}>
            Enter your email and we will send a password reset link.
          </p>

          {!submitted ? <form onSubmit={handleSubmit} className={styles.form}>
              <Input label="Email" type="email" name="email" placeholder="Enter your email" value={email} onChange={e => {
            setEmail(e.target.value);
            if (error) setError('');
          }} error={error} icon={<FiMail />} />

              <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} icon={<FiArrowRight />}>

                Send Reset Link
              </Button>
            </form> : <div className={styles.successBox}>
              {emailSent ? <>If an account exists for <strong>{email}</strong>, check your inbox for a reset link.</> : <>
                  Email delivery is not configured on this server yet.
                  {deliveryReason ? ` (${deliveryReason})` : ''} Use the development reset link below.
                </>}
              {resetUrl && !emailSent && <div className={styles.devResetLink}>
                  <span>Development link:</span>{' '}
                  <a href={resetUrl}>Open reset page</a>
                </div>}
            </div>}

          <p className={styles.switchText}>
            Remembered your password?{' '}
            <Link to="/login" className={styles.switchLink}>
              Back to Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>;
};
export default ForgotPassword;
