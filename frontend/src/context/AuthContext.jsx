/**
 * ============================================================================
 * AUTHCONTEXT.JSX - AUTHENTICATION STATE MANAGEMENT
 * ============================================================================
 * 
 * REACT CONTEXT - SOLVING THE "PROP DRILLING" PROBLEM
 * 
 * THE PROBLEM:
 * Without Context, passing data through many levels is tedious:
 * 
 * <App user={user}>                    // App has user
 *   <Layout user={user}>               // Pass to Layout
 *     <Navbar user={user}>             // Pass to Navbar
 *       <UserMenu user={user} />       // Finally uses it
 *     </Navbar>
 *   </Layout>
 * </App>
 * 
 * This is called "prop drilling" and it's annoying.
 * 
 * THE SOLUTION - CONTEXT:
 * Context provides a way to pass data through the component tree
 * without having to pass props down manually at every level.
 * 
 * <AuthProvider>           // Provides user to all descendants
 *   <App>
 *     <Layout>
 *       <Navbar>
 *         <UserMenu />     // Can access user directly!
 *       </Navbar>
 *     </Layout>
 *   </App>
 * </AuthProvider>
 * 
 * HOW CONTEXT WORKS:
 * 1. createContext() - Creates a Context object
 * 2. <Context.Provider value={...}> - Provides value to descendants
 * 3. useContext(Context) - Consumes the value in any descendant
 * 
 * ============================================================================
 */

/**
 * REACT HOOKS IMPORTS
 * 
 * Hooks are special functions that let you use React features.
 * Built-in hooks:
 * - useState: Add state to function components
 * - useEffect: Run side effects (API calls, subscriptions)
 * - useContext: Access Context values
 * - useCallback: Memoize functions (prevent recreation)
 * - useMemo: Memoize values
 * - useRef: Store mutable values that don't cause re-renders
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

/**
 * CREATE THE CONTEXT
 * 
 * createContext() creates a Context object.
 * The argument (null) is the default value - used if no Provider is found.
 * 
 * A Context has two parts:
 * - Provider: Wraps components that need access
 * - Consumer: Components that use the value (via useContext)
 */
const AuthContext = createContext(null);

/**
 * ============================================================================
 * CUSTOM HOOK: useAuth
 * ============================================================================
 * 
 * CUSTOM HOOKS:
 * Custom hooks are functions that use other hooks.
 * They let you extract component logic into reusable functions.
 * 
 * Naming convention: Always start with "use" (useAuth, useFetch, useForm)
 * This lets React know it's a hook and enforce hook rules.
 * 
 * WHY THIS WRAPPER?
 * 1. Simpler usage: useAuth() instead of useContext(AuthContext)
 * 2. Error handling: Throws if used outside Provider
 * 3. Type safety: Ensures non-null value
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * ============================================================================
 * AUTH PROVIDER COMPONENT
 * ============================================================================
 * 
 * This component wraps the app and provides authentication state/functions
 * to all descendants.
 * 
 * PROPS:
 * { children } - Special React prop containing nested components
 * 
 * Usage:
 * <AuthProvider>
 *   <App />      ← children
 * </AuthProvider>
 */
export const AuthProvider = ({ children }) => {
  /**
   * ============================================================================
   * useState HOOK - COMPONENT STATE
   * ============================================================================
   * 
   * useState adds state to function components.
   * 
   * Syntax: const [value, setValue] = useState(initialValue);
   * 
   * Returns an array with two elements:
   * 1. Current state value
   * 2. Function to update the state
   * 
   * RULES:
   * - Never modify state directly (user = {...}) - always use setter
   * - State updates are asynchronous
   * - State updates trigger re-renders
   */
  const [user, setUser] = useState(null);
  
  /**
   * LAZY INITIAL STATE
   * 
   * useState(() => ...) runs the function once on first render.
   * This is useful for expensive operations or reading from storage.
   * 
   * Here we read the token from localStorage on initial load.
   * localStorage persists data even after browser closes.
   */
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * ============================================================================
   * useEffect HOOK - SIDE EFFECTS
   * ============================================================================
   * 
   * useEffect runs code "outside" the render cycle.
   * 
   * USE CASES:
   * - API calls
   * - Subscriptions (WebSocket, events)
   * - DOM manipulation
   * - Timers
   * 
   * SYNTAX:
   * useEffect(() => {
   *   // Effect code (runs after render)
   *   return () => { /* cleanup code * / };  // Optional
   * }, [dependencies]);  // When to re-run
   * 
   * DEPENDENCY ARRAY:
   * - []: Run once on mount
   * - [a, b]: Run when a or b changes
   * - No array: Run after every render (usually wrong!)
   * 
   * CLEANUP:
   * Return a function to clean up (unsubscribe, cancel timers)
   */
  useEffect(() => {
    /**
     * LOAD USER ON MOUNT
     * 
     * When the app starts, if we have a token, fetch user data.
     * This "rehydrates" the user from the saved token.
     */
    const loadUser = async () => {
      // No token = not logged in
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        /**
         * ASYNC/AWAIT IN EFFECTS
         * 
         * useEffect callbacks can't be async directly.
         * Solution: Define async function inside and call it.
         */
        const response = await api.get('/auth/me');
        setUser(response.data.data.user);
      } catch (err) {
        // Token invalid or expired - clear it
        console.error('Failed to load user:', err);
        localStorage.removeItem('token');
        setToken(null);
      } finally {
        // Always stop loading, whether success or failure
        setLoading(false);
      }
    };

    loadUser();
  }, [token]);  // Re-run if token changes

  /**
   * ============================================================================
   * useCallback HOOK - MEMOIZED FUNCTIONS
   * ============================================================================
   * 
   * PROBLEM:
   * In JavaScript, functions are recreated every render:
   *   const handleClick = () => { ... };  // New function every render!
   * 
   * This can cause issues:
   * - Triggers re-renders in child components
   * - Breaks dependency arrays in effects
   * 
   * SOLUTION:
   * useCallback memoizes the function - same function reference across renders.
   * 
   * const handleClick = useCallback(() => {
   *   // function body
   * }, [dependencies]);  // Only recreate if dependencies change
   * 
   * Here, [] means the function never needs to be recreated.
   */
  
  /**
   * REGISTER - Create new account
   */
  const register = useCallback(async (userData) => {
    setError(null);  // Clear previous errors
    try {
      const response = await api.post('/auth/register', userData);
      
      /**
       * DESTRUCTURING RESPONSE
       * 
       * Rename during destructure: { token: newToken } means
       * "extract 'token' but call it 'newToken' locally"
       */
      const { token: newToken, user: newUser } = response.data.data;
      
      // Persist token for future sessions
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(newUser);
      
      return { success: true };
    } catch (err) {
      /**
       * OPTIONAL CHAINING
       * 
       * err.response?.data?.error safely accesses nested properties.
       * If any part is undefined, returns undefined instead of error.
       */
      const message = err.response?.data?.error || 'Registration failed';
      setError(message);
      return { success: false, error: message };
    }
  }, []);

  /**
   * LOGIN - Authenticate existing user
   */
  const login = useCallback(async (credentials) => {
    setError(null);
    try {
      const response = await api.post('/auth/login', credentials);
      const { token: newToken, user: newUser } = response.data.data;
      
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(newUser);
      
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.error || 'Login failed';
      setError(message);
      return { success: false, error: message };
    }
  }, []);

  /**
   * LOGOUT - Clear authentication state
   */
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    // No need to call backend - JWT is stateless
  }, []);

  /**
   * UPDATE USER - Locally update user data
   * 
   * Used after profile updates to reflect changes without API call.
   */
  const updateUser = useCallback((updates) => {
    /**
     * FUNCTIONAL STATE UPDATE
     * 
     * setUser(prev => newValue) receives previous state as argument.
     * Use this when new state depends on previous state.
     * 
     * SPREAD OPERATOR
     * { ...prev, ...updates } merges objects:
     * prev = { name: 'John', email: 'john@test.com' }
     * updates = { name: 'Jane' }
     * result = { name: 'Jane', email: 'john@test.com' }
     */
    setUser(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * REFRESH USER - Fetch latest user data from server
   */
  const refreshUser = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await api.get('/auth/me');
      setUser(response.data.data.user);
    } catch (err) {
      console.error('Failed to refresh user:', err);
    }
  }, [token]);

  /**
   * ============================================================================
   * CONTEXT VALUE
   * ============================================================================
   * 
   * The value provided to all consuming components.
   * This object contains:
   * - State values (user, token, loading, error)
   * - Derived values (isAuthenticated)
   * - Functions (register, login, logout, etc.)
   * 
   * !!user converts to boolean: null → false, {user} → true
   */
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

  /**
   * RENDER PROVIDER
   * 
   * <AuthContext.Provider value={value}>
   *   {children}
   * </AuthContext.Provider>
   * 
   * All components wrapped by this Provider can access 'value'
   * using useContext(AuthContext) or our useAuth() hook.
   */
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
