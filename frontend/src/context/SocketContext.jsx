/**
 * ============================================================================
 * SOCKETCONTEXT.JSX - REAL-TIME COMMUNICATION STATE MANAGEMENT
 * ============================================================================
 * 
 * This Context manages the WebSocket connection for real-time features:
 * - Live game communication
 * - Matchmaking queue
 * - Real-time updates
 * 
 * SOCKET.IO CLIENT:
 * The client-side library that connects to our Socket.io server.
 * It handles:
 * - Connection/reconnection
 * - Event-based messaging
 * - Fallback to polling if WebSocket fails
 * 
 * PATTERN: CONTEXT + SOCKET.IO
 * By wrapping Socket.io in a Context, we:
 * 1. Share one connection across all components
 * 2. Auto-connect when user logs in
 * 3. Auto-disconnect when user logs out
 * 4. Provide easy-to-use hooks (useSocket)
 * 
 * ============================================================================
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';  // Socket.io client library
import { useAuth } from './AuthContext';

// Create the Context
const SocketContext = createContext(null);

const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/, '');

const inferSocketBaseUrl = () => {
  const explicitSocketUrl = trimTrailingSlash(import.meta.env.VITE_SOCKET_URL || '');
  if (explicitSocketUrl) return explicitSocketUrl;

  const apiUrl = trimTrailingSlash(import.meta.env.VITE_API_URL || '');
  if (!apiUrl) return '';

  // If API URL ends with /api, connect Socket.IO at the service root.
  return apiUrl.replace(/\/api$/i, '');
};

/**
 * CUSTOM HOOK: useSocket
 * 
 * Provides access to socket state and methods from any component.
 * 
 * Usage:
 *   const { socket, isConnected, emit, on } = useSocket();
 */
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

/**
 * SOCKET PROVIDER COMPONENT
 * 
 * Manages socket connection lifecycle and provides socket to children.
 */
export const SocketProvider = ({ children }) => {
  /**
   * STATE
   * 
   * socket: The Socket.io client instance (or null if not connected)
   * isConnected: Boolean indicating connection status
   * queueStats: Data about matchmaking queue (players waiting)
   */
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [queueStats, setQueueStats] = useState({
    playersInQueue: 0,
    byQueue: {
      ranked_1v1: 0,
      unranked_1v1: 0
    }
  });
  
  /**
   * REF to track socket instance across renders
   * This prevents React StrictMode double-render from creating multiple sockets
   */
  const socketRef = useRef(null);
  
  /**
   * Get auth state from AuthContext
   * 
   * We need token for socket authentication
   * isAuthenticated tells us when to connect/disconnect
   */
  const { token, isAuthenticated } = useAuth();

  /**
   * ============================================================================
   * SOCKET CONNECTION MANAGEMENT
   * ============================================================================
   * 
   * This effect manages the socket lifecycle:
   * - Connect when user logs in
   * - Disconnect when user logs out
   * - Set up event listeners
   * - Clean up on unmount
   */
  useEffect(() => {
    /**
     * DISCONNECT IF NOT AUTHENTICATED
     * 
     * When user logs out:
     * 1. Disconnect existing socket
     * 2. Clear socket state
     * 3. Return early (don't create new connection)
     */
    if (!isAuthenticated || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // If we already have a connected socket, don't recreate it
    // This prevents disconnection during React re-renders/navigation
    if (socketRef.current && socketRef.current.connected) {
      return;
    }

    // If socket exists but is disconnected, try to reconnect
    if (socketRef.current && !socketRef.current.connected) {
      socketRef.current.connect();
      return;
    }

    /**
     * CREATE SOCKET CONNECTION
     * 
     * io() creates a Socket.io client that connects to the server.
     * 
     * CONFIGURATION OPTIONS:
     * - auth: { token } - Sent during handshake for authentication
     * - transports: Preferred transport methods (WebSocket first, polling fallback)
     * - reconnection: Automatically reconnect if disconnected
     * - reconnectionAttempts: How many times to try reconnecting
     * - reconnectionDelay: Wait between reconnection attempts (ms)
     * 
     * VITE ENVIRONMENT VARIABLES:
     * import.meta.env.VITE_* accesses variables from .env file.
     * Variables must be prefixed with VITE_ to be exposed to client.
     */
    const socketInstance = io(inferSocketBaseUrl(), {
      auth: { token },  // Backend uses this for authentication
      transports: ['websocket', 'polling'],  // Prefer WebSocket
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });

    /**
     * SOCKET EVENT LISTENERS
     * 
     * Socket.io has built-in events:
     * - 'connect': Successfully connected to server
     * - 'disconnect': Connection lost
     * - 'connect_error': Failed to connect
     * 
     * Custom events (like 'matchmaking:stats') are defined by our backend.
     */
    
    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
      setIsConnected(true);
    });

    socketInstance.on('disconnect', (reason) => {
      /**
       * DISCONNECT REASONS:
       * - 'io server disconnect': Server kicked us
       * - 'io client disconnect': We called socket.disconnect()
       * - 'ping timeout': No response from server
       * - 'transport close': Connection dropped
       * - 'transport error': Connection error
       */
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setIsConnected(false);
    });

    /**
     * CUSTOM EVENT: matchmaking:stats
     * 
     * Server periodically broadcasts queue statistics.
     * We store them in state to display in UI.
     */
    socketInstance.on('matchmaking:stats', (stats) => {
      setQueueStats(stats);
    });

    // Store socket instance in ref AND state
    socketRef.current = socketInstance;
    setSocket(socketInstance);

    /**
     * CLEANUP FUNCTION
     * 
     * useEffect cleanup runs when:
     * - Component unmounts
     * - Dependencies change (before running new effect)
     * 
     * IMPORTANT: We do NOT disconnect in cleanup because:
     * 1. React StrictMode causes double-mount in dev
     * 2. Normal navigation shouldn't disconnect
     * 
     * Socket is only disconnected when isAuthenticated becomes false (logout)
     */
    return () => {
      // Don't disconnect on cleanup - let the socket persist
      // It will be disconnected when user logs out (isAuthenticated = false)
    };
  }, [isAuthenticated, token]);  // Re-run when auth state changes

  /**
   * ============================================================================
   * HELPER FUNCTIONS
   * ============================================================================
   * 
   * These provide a clean API for components to interact with the socket.
   * They handle null checks and simplify common operations.
   */

  /**
   * EMIT - Send event to server
   * 
   * Usage:
   *   emit('game:buzz', { gameCode: 'ABC123' });
   */
  const emit = useCallback((event, data) => {
    if (socket && isConnected) {
      socket.emit(event, data);
    }
  }, [socket, isConnected]);

  /**
   * ON - Listen for event from server
   * 
   * Returns a cleanup function to remove the listener.
   * 
   * Usage in component:
   *   useEffect(() => {
   *     const cleanup = on('game:start', (data) => {
   *       console.log('Game started!', data);
   *     });
   *     return cleanup;  // Remove listener on unmount
   *   }, [on]);
   */
  const on = useCallback((event, callback) => {
    if (socket) {
      socket.on(event, callback);
      // Return cleanup function
      return () => socket.off(event, callback);
    }
    return () => {};  // Noop if no socket
  }, [socket]);

  /**
   * OFF - Remove event listener
   * 
   * Alternative to using the cleanup function from on().
   * 
   * Usage:
   *   off('game:start', myCallback);
   */
  const off = useCallback((event, callback) => {
    if (socket) {
      socket.off(event, callback);
    }
  }, [socket]);

  /**
   * CONTEXT VALUE
   * 
   * Everything that consuming components can access.
   */
  const value = {
    socket,         // Raw socket instance (for advanced usage)
    isConnected,    // Connection status
    queueStats,     // Matchmaking queue info
    emit,           // Send events
    on,             // Listen for events
    off             // Remove listeners
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;
