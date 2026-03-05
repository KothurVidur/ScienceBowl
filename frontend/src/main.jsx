/**
 * ============================================================================
 * MAIN.JSX - THE ENTRY POINT OF THE REACT APPLICATION
 * ============================================================================
 * 
 * This is the first JavaScript file that runs when your React app loads.
 * It's referenced in index.html: <script type="module" src="/src/main.jsx">
 * 
 * WHAT THIS FILE DOES:
 * 1. Creates the React root (where React renders)
 * 2. Sets up global providers (Context, Router)
 * 3. Renders the App component into the DOM
 * 
 * PROVIDER HIERARCHY:
 * The order of providers matters! Outer providers are available to inner ones.
 * 
 * React.StrictMode
 * └── BrowserRouter      (Routing available everywhere)
 *     └── AuthProvider   (Auth state available everywhere)
 *         └── SocketProvider  (Can access AuthProvider)
 *             └── App         (Can access everything above)
 * 
 * ============================================================================
 */

/**
 * REACT IMPORTS
 * 
 * React: The core library
 * ReactDOM: Connects React to the browser's DOM
 * 
 * Note: In React 18+, we use 'react-dom/client' (not 'react-dom')
 */
import React from 'react';
import ReactDOM from 'react-dom/client';

/**
 * BROWSER ROUTER
 * 
 * From react-router-dom, enables client-side routing.
 * Wrapping the app enables <Routes>, <Route>, <Link>, etc.
 * 
 * "Browser" Router uses clean URLs (/dashboard, /profile)
 * as opposed to "Hash" Router (#/dashboard, #/profile)
 */
import { BrowserRouter } from 'react-router-dom';

// Our main App component
import App from './App';

// Context Providers (global state)
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';

/**
 * GLOBAL STYLES
 * 
 * Importing CSS directly makes it apply globally.
 * globals.css contains:
 * - CSS reset
 * - CSS custom properties (variables)
 * - Base typography
 * - Global animations
 */
import './styles/globals.css';

/**
 * ============================================================================
 * RENDERING THE APPLICATION
 * ============================================================================
 * 
 * ReactDOM.createRoot() - REACT 18+ CONCURRENT RENDERING
 * 
 * This creates a "root" where React manages the DOM.
 * Everything inside this root is controlled by React.
 * 
 * document.getElementById('root') finds the <div id="root"> in index.html
 * This empty div is where the entire React app is rendered.
 * 
 * .render() actually renders the component tree into the DOM.
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  /**
   * REACT STRICT MODE
   * 
   * A development tool that helps find problems:
   * - Warns about deprecated lifecycle methods
   * - Warns about legacy string refs
   * - Detects unexpected side effects
   * - Components render twice in dev (to catch issues)
   * 
   * IMPORTANT: StrictMode only affects development builds.
   * In production, there's no double-rendering or extra checks.
   * 
   * The double-rendering helps catch:
   * - Side effects in render (like modifying state directly)
   * - Components that don't clean up properly
   */
  <React.StrictMode>
    {/**
     * BROWSER ROUTER
     * 
     * Must wrap the entire app to enable routing.
     * Any component inside can use:
     * - useNavigate() to programmatically navigate
     * - useLocation() to get current URL info
     * - useParams() to get URL parameters
     * - <Link to="/path"> for navigation links
     */}
    <BrowserRouter>
      {/**
       * AUTH PROVIDER
       * 
       * Provides authentication state to the entire app.
       * Any component can now use useAuth() to access:
       * - user, token, isAuthenticated
       * - login(), logout(), register()
       */}
      <AuthProvider>
        {/**
         * SOCKET PROVIDER
         * 
         * Provides WebSocket connection for real-time features.
         * Must be inside AuthProvider because it needs the token.
         * 
         * Any component can use useSocket() to access:
         * - socket, isConnected
         * - emit(), on(), off()
         */}
        <SocketProvider>
          {/**
           * APP COMPONENT
           * 
           * The root component of our application.
           * Contains all the routes and page components.
           */}
          <App />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
