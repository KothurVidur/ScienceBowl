import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
const SocketContext = createContext(null);
const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/, '');
const inferSocketBaseUrl = () => {
  const explicitSocketUrl = trimTrailingSlash(import.meta.env.VITE_SOCKET_URL || '');
  if (explicitSocketUrl) return explicitSocketUrl;
  const apiUrl = trimTrailingSlash(import.meta.env.VITE_API_URL || '/api');
  if (!apiUrl || apiUrl.startsWith('/')) return window.location.origin;
  try {
    const parsedApiUrl = new URL(apiUrl, window.location.origin);
    const socketOrigin = `${parsedApiUrl.protocol}//${parsedApiUrl.host}`;
    return socketOrigin.replace(/\/+$/, '');
  } catch (_) {
    return window.location.origin;
  }
};
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
export const SocketProvider = ({
  children
}) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [queueStats, setQueueStats] = useState({
    playersInQueue: 0,
    byQueue: {
      ranked_1v1: 0,
      unranked_1v1: 0
    }
  });
  const socketRef = useRef(null);
  const {
    token,
    isAuthenticated
  } = useAuth();
  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }
    if (socketRef.current && socketRef.current.connected) {
      return;
    }
    if (socketRef.current && !socketRef.current.connected) {
      socketRef.current.connect();
      return;
    }
    const socketInstance = io(inferSocketBaseUrl(), {
      auth: {
        token
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });
    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
      setIsConnected(true);
    });
    socketInstance.on('disconnect', reason => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
    });
    socketInstance.on('connect_error', error => {
      console.error('Socket connection error:', error);
      setIsConnected(false);
    });
    socketInstance.on('matchmaking:stats', stats => {
      setQueueStats(stats);
    });
    socketRef.current = socketInstance;
    setSocket(socketInstance);
    return () => {};
  }, [isAuthenticated, token]);
  const emit = useCallback((event, data) => {
    if (socket && isConnected) {
      socket.emit(event, data);
    }
  }, [socket, isConnected]);
  const on = useCallback((event, callback) => {
    if (socket) {
      socket.on(event, callback);
      return () => socket.off(event, callback);
    }
    return () => {};
  }, [socket]);
  const off = useCallback((event, callback) => {
    if (socket) {
      socket.off(event, callback);
    }
  }, [socket]);
  const value = {
    socket,
    isConnected,
    queueStats,
    emit,
    on,
    off
  };
  return <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>;
};
export default SocketContext;
