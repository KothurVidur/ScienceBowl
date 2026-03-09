import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiUser, FiMail, FiLock, FiArrowRight } from 'react-icons/fi';
import Button from '../components/Button';
import Input from '../components/Input';
import toast from 'react-hot-toast';
import styles from './Auth.module.css';
const STRICT_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const {
    register,
    isAuthenticated
  } = useAuth();
  const navigate = useNavigate();
  if (isAuthenticated) {
    navigate('/dashboard', {
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
    if (!formData.username) {
      newErrors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      newErrors.username = 'Username can only contain letters, numbers, and underscores';
    }
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!STRICT_EMAIL_REGEX.test(String(formData.email || '').trim())) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = 'Password must contain uppercase, lowercase, and number';
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  const handleSubmit = async e => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    const result = await register({
      username: formData.username,
      email: String(formData.email || '').trim().toLowerCase(),
      password: formData.password
    });
    setLoading(false);
    if (result.success) {
      toast.success('Account created successfully!');
      navigate('/dashboard');
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

          <h1 className={styles.title}>Create Account</h1>
          <p className={styles.subtitle}>Join the competition today</p>

          <form onSubmit={handleSubmit} className={styles.form}>
            <Input label="Username" type="text" name="username" placeholder="Choose a username" value={formData.username} onChange={handleChange} error={errors.username} icon={<FiUser />} />

            <Input label="Email" type="email" name="email" placeholder="Enter your email" value={formData.email} onChange={handleChange} error={errors.email} icon={<FiMail />} />

            <Input label="Password" type="password" name="password" placeholder="Create a password" value={formData.password} onChange={handleChange} error={errors.password} icon={<FiLock />} />

            <Input label="Confirm Password" type="password" name="confirmPassword" placeholder="Confirm your password" value={formData.confirmPassword} onChange={handleChange} error={errors.confirmPassword} icon={<FiLock />} />

            <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} icon={<FiArrowRight />}>

              Create Account
            </Button>
          </form>

          <p className={styles.switchText}>
            Already have an account?{' '}
            <Link to="/login" className={styles.switchLink}>
              Sign in
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
export default Register;
