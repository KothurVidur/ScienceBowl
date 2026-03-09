import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
const AuthContext = createContext(null);
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
export const AuthProvider = ({
  children
}) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    const loadUser = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await api.get('/auth/me');
        setUser(response.data.data.user);
      } catch (err) {
        console.error('Failed to load user:', err);
        localStorage.removeItem('token');
        setToken(null);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, [token]);
  const register = useCallback(async userData => {
    setError(null);
    try {
      const response = await api.post('/auth/register', userData);
      const {
        token: newToken,
        user: newUser
      } = response.data.data;
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(newUser);
      return {
        success: true
      };
    } catch (err) {
      const message = err.response?.data?.error || 'Registration failed';
      setError(message);
      return {
        success: false,
        error: message
      };
    }
  }, []);
  const login = useCallback(async credentials => {
    setError(null);
    try {
      const response = await api.post('/auth/login', credentials);
      const {
        token: newToken,
        user: newUser
      } = response.data.data;
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(newUser);
      return {
        success: true
      };
    } catch (err) {
      const message = err.response?.data?.error || 'Login failed';
      setError(message);
      return {
        success: false,
        error: message
      };
    }
  }, []);
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }, []);
  const updateUser = useCallback(updates => {
    setUser(prev => ({
      ...prev,
      ...updates
    }));
  }, []);
  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const response = await api.get('/auth/me');
      setUser(response.data.data.user);
    } catch (err) {
      console.error('Failed to refresh user:', err);
    }
  }, [token]);
  const value = {
    user,
    token,
    loading,
    error,
    isAuthenticated: !!user,
    register,
    login,
    logout,
    updateUser,
    refreshUser,
    clearError: () => setError(null)
  };
  return <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>;
};
export default AuthContext;
