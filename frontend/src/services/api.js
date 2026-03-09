import axios from 'axios';
const resolveApiUrl = () => {
  const configured = String(import.meta.env.VITE_API_URL || '').trim();
  if (!configured) return '/api';
  return configured.replace(/\/+$/, '');
};
const API_URL = resolveApiUrl();
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 10000;
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: API_TIMEOUT_MS
});
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, error => {
  return Promise.reject(error);
});
api.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401) {
    const currentPath = window.location.pathname;
    if (currentPath !== '/login' && currentPath !== '/register') {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
  }
  return Promise.reject(error);
});
export default api;
export const authAPI = {
  register: data => api.post('/auth/register', data),
  login: data => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  changePassword: data => api.put('/auth/password', data),
  forgotPassword: data => api.post('/auth/forgot-password', data),
  resetPassword: (token, data) => api.post(`/auth/reset-password/${token}`, data)
};
export const userAPI = {
  getProfile: username => api.get(`/users/${username}`),
  updateProfile: data => api.put('/users/profile', data),
  getGames: (username, options = {}) => {
    const normalizedOptions = typeof options === 'number' ? {
      page: options
    } : options;
    const {
      page = 1,
      limit
    } = normalizedOptions;
    const params = new URLSearchParams({
      page: String(page)
    });
    if (limit !== undefined && limit !== null) params.set('limit', String(limit));
    return api.get(`/users/${username}/games?${params.toString()}`);
  },
  getRatingHistory: (username, days = 30) => api.get(`/users/${username}/rating-history?days=${days}`),
  getStats: username => api.get(`/users/${username}/stats`),
  getLeaderboard: (params = {}) => api.get('/users/leaderboard', {
    params
  }),
  searchUsers: query => api.get(`/users/search?q=${query}`)
};
export const gameAPI = {
  create: data => api.post('/games', data),
  getByCode: code => api.get(`/games/code/${code}`),
  getById: id => api.get(`/games/${id}`),
  join: code => api.post(`/games/${code}/join`),
  getCurrentQuestion: id => api.get(`/games/${id}/current-question`),
  getReview: id => api.get(`/games/${id}/review`),
  voteReviewProtest: (id, payload) => api.post(`/games/${id}/review/protest-vote`, payload),
  forfeitReviewProtests: id => api.post(`/games/${id}/review/forfeit`),
  getStats: () => api.get('/games/stats'),
  cancel: id => api.post(`/games/${id}/cancel`),
  getActive: () => api.get('/games/user/active')
};
export const questionAPI = {
  getStats: () => api.get('/questions/stats'),
  getPractice: (params = {}) => api.get('/questions/practice', {
    params
  }),
  checkAnswer: (id, answer) => api.post(`/questions/${id}/check`, {
    answer
  }),
  report: id => api.post(`/questions/${id}/report`),
  getCategories: () => api.get('/questions/categories')
};
