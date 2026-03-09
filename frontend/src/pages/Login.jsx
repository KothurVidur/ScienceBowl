import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiMail, FiLock, FiArrowRight } from 'react-icons/fi';
import Button from '../components/Button';
import Input from '../components/Input';
import toast from 'react-hot-toast';
import styles from './Auth.module.css';
const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const {
    login,
    isAuthenticated
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';
  if (isAuthenticated) {
    navigate(from, {
      replace: true
    });
    return null;
  }
  const handleChange = e => {
    const {
      name,
      value
    } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };
  const validate = () => {
    const newErrors = {};
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  const handleSubmit = async e => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    const result = await login(formData);
    setLoading(false);
    if (result.success) {
      toast.success('Welcome back!');
      navigate(from, {
        replace: true
      });
    } else {
      toast.error(result.error);
    }
  };
  return <div className={styles.authPage}>
      <div className={styles.authContainer}>
        <div className={styles.authCard}>
          {}
          <Link to="/" className={styles.logo}>
            <span className={styles.logoIcon}>⚗️</span>
            <span className={styles.logoText}>ScienceBowlOne</span>
          </Link>

          <h1 className={styles.title}>Welcome Back</h1>
          <p className={styles.subtitle}>Sign in to continue your journey</p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <Input label="Email" type="email" name="email" placeholder="Enter your email" value={formData.email} onChange={handleChange} error={errors.email} icon={<FiMail />} />

            <Input label="Password" type="password" name="password" placeholder="Enter your password" value={formData.password} onChange={handleChange} error={errors.password} icon={<FiLock />} />

            <div className={styles.inlineActionRow}>
              <Link to="/forgot-password" className={styles.inlineLink}>
                Forgot password?
              </Link>
            </div>

            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} icon={<FiArrowRight />}>

              Sign In
            </Button>
          </form>

          <p className={styles.switchText}>
            Don't have an account?{' '}
            <Link to="/register" className={styles.switchLink}>
              Create one
            </Link>
          </p>
        </div>

        {}
        <div className={styles.decoration}>
          <div className={styles.molecule}>
            <div className={styles.atom}></div>
            <div className={styles.atom}></div>
            <div className={styles.atom}></div>
            <div className={styles.orbit}></div>
          </div>
        </div>
      </div>
    </div>;
};
export default Login;
