import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Play from './pages/Play';
import InProgress from './pages/InProgress';
import Game from './pages/Game';
import GameReview from './pages/GameReview';
import GameLinkError from './pages/GameLinkError';
import Practice from './pages/Practice';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

function App() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>Loading Science Bowl Online...</p>
        </div>
        <style>{`
          .loading-screen {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: var(--bg-primary);
          }
          .loading-content {
            text-align: center;
          }
          .loading-spinner {
            width: 48px;
            height: 48px;
            border: 3px solid var(--bg-tertiary);
            border-top-color: var(--primary-500);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
          },
          success: {
            iconTheme: {
              primary: 'var(--accent-emerald)',
              secondary: 'var(--text-primary)',
            },
          },
          error: {
            iconTheme: {
              primary: 'var(--accent-rose)',
              secondary: 'var(--text-primary)',
            },
          },
        }}
      />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/leaderboard" element={<Layout><Leaderboard /></Layout>} />
        <Route path="/profile/:username" element={<Layout><Profile /></Layout>} />

        <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
        <Route path="/play" element={<ProtectedRoute><Layout><Play /></Layout></ProtectedRoute>} />
        <Route path="/in-progress" element={<ProtectedRoute><Layout><InProgress /></Layout></ProtectedRoute>} />
        <Route path="/game/:gameCode" element={<ProtectedRoute><Game /></ProtectedRoute>} />
        <Route path="/game-error" element={<ProtectedRoute><Layout><GameLinkError /></Layout></ProtectedRoute>} />
        <Route path="/games/:gameId/review" element={<ProtectedRoute><Layout><GameReview /></Layout></ProtectedRoute>} />
        <Route path="/practice" element={<ProtectedRoute><Layout><Practice /></Layout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />

        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </>
  );
}

export default App;
