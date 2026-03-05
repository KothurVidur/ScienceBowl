/**
 * ============================================================================
 * PROTECTEDROUTE.JSX - AUTHENTICATION GUARD COMPONENT
 * ============================================================================
 * 
 * WHAT IS A PROTECTED ROUTE?
 * A route that requires authentication to access.
 * If user is not logged in, they're redirected to login.
 * 
 * PATTERN: HIGHER-ORDER COMPONENT (HOC) / WRAPPER COMPONENT
 * This component wraps other components and adds functionality.
 * In this case, it adds authentication checking.
 * 
 * USAGE:
 * <ProtectedRoute>
 *   <Dashboard />   ← Only renders if authenticated
 * </ProtectedRoute>
 * 
 * Or in routes:
 * <Route path="/dashboard" element={
 *   <ProtectedRoute>
 *     <Dashboard />
 *   </ProtectedRoute>
 * } />
 * 
 * ============================================================================
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * PROTECTEDROUTE COMPONENT
 * 
 * PROPS:
 * - children: The component(s) to render if authenticated
 * 
 * { children } is React's special prop containing nested elements.
 * When you write <ProtectedRoute><Dashboard /></ProtectedRoute>,
 * 'children' is <Dashboard />.
 */
const ProtectedRoute = ({ children }) => {
  /**
   * Get auth state from context
   * - isAuthenticated: Is user logged in?
   * - loading: Are we still checking auth status?
   */
  const { isAuthenticated, loading } = useAuth();
  
  /**
   * useLocation HOOK
   * 
   * From react-router-dom, returns the current location object:
   * {
   *   pathname: '/dashboard',
   *   search: '?tab=settings',
   *   hash: '#section1',
   *   state: { any: 'data' }
   * }
   * 
   * We use this to remember where the user was trying to go,
   * so we can redirect them back after login.
   */
  const location = useLocation();

  /**
   * LOADING STATE
   * 
   * While checking authentication (API call to /auth/me), show a spinner.
   * This prevents briefly showing login page before auth is confirmed.
   * 
   * INLINE STYLES:
   * Using style={{ }} for small, component-specific styles.
   * For larger style sets, use CSS files or CSS Modules.
   */
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-primary)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid var(--bg-tertiary)',
            borderTopColor: 'var(--primary-500)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  /**
   * NOT AUTHENTICATED - REDIRECT TO LOGIN
   * 
   * <Navigate> is react-router-dom's component for programmatic navigation.
   * 
   * PROPS:
   * - to: Where to redirect ("/login")
   * - state: Data to pass to the next page (the original location)
   * - replace: Replace current history entry (prevents back-to-protected-page)
   * 
   * STATE PROP:
   * We pass { from: location } so the login page knows where to
   * redirect after successful login.
   * 
   * Login page can access: const { from } = location.state || {}
   * Then redirect: navigate(from.pathname || '/dashboard')
   */
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  /**
   * AUTHENTICATED - RENDER CHILDREN
   * 
   * If user is authenticated, simply render the wrapped components.
   * 'children' is whatever was passed inside <ProtectedRoute>...</ProtectedRoute>
   */
  return children;
};

export default ProtectedRoute;
