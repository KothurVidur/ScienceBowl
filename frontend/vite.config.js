/**
 * ============================================================================
 * VITE.CONFIG.JS - VITE BUILD TOOL CONFIGURATION
 * ============================================================================
 * 
 * WHAT IS VITE?
 * Vite (French for "fast") is a modern build tool for web projects.
 * It's much faster than older tools like webpack or Create React App.
 * 
 * WHY VITE IS FAST:
 * 1. DEVELOPMENT: Uses native ES modules - no bundling during development
 *    - The browser loads modules directly
 *    - Only transforms files as they're requested
 *    - Changes appear instantly (HMR - Hot Module Replacement)
 * 
 * 2. PRODUCTION: Uses Rollup for efficient bundling
 *    - Code splitting (separate bundles for different routes)
 *    - Tree shaking (removes unused code)
 *    - Minification (smaller file sizes)
 * 
 * VITE VS CREATE-REACT-APP:
 * - CRA: Bundles EVERYTHING for development (slow startup)
 * - Vite: Serves files on-demand (instant startup)
 * - Vite: 10-100x faster in large projects
 * 
 * ============================================================================
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * VITE CONFIGURATION
 * 
 * defineConfig() provides type hints and validation.
 * Export default so Vite can find it.
 */
export default defineConfig({
  /**
   * PLUGINS
   * 
   * Plugins extend Vite's functionality.
   * @vitejs/plugin-react enables:
   * - JSX transformation
   * - Fast Refresh (instant updates without losing state)
   * - Automatic React imports (no need to import React)
   */
  plugins: [react()],
  
  /**
   * ============================================================================
   * DEVELOPMENT SERVER CONFIGURATION
   * ============================================================================
   */
  server: {
    // Port to run the dev server on
    port: 3000,
    
    /**
     * PROXY CONFIGURATION
     * 
     * WHY PROXY?
     * During development:
     * - Frontend runs on http://localhost:3000
     * - Backend runs on http://localhost:5000
     * 
     * This creates CORS issues (cross-origin requests blocked).
     * 
     * PROXY SOLUTION:
     * - Frontend calls /api/users (same origin - no CORS!)
     * - Vite intercepts and forwards to http://localhost:5000/api/users
     * - Backend responds to Vite
     * - Vite sends response to browser
     * 
     * From browser's perspective, everything is on localhost:3000.
     */
    proxy: {
      /**
       * API PROXY
       * 
       * Requests starting with /api are forwarded to backend.
       * /api/auth/login → http://localhost:5000/api/auth/login
       */
      '/api': {
        target: 'http://localhost:5000',  // Backend URL
        changeOrigin: true,  // Changes origin header to match target
        configure: (proxy) => {
          proxy.on('error', (err, _req, _res) => {
            if (err.code === 'ECONNREFUSED' || err.code === 'EPIPE') {
              console.warn('[vite proxy] Backend unreachable or connection closed:', err.code);
            } else {
              console.error('[vite proxy]', err.message);
            }
          });
        }
      },
      
      /**
       * WEBSOCKET PROXY
       * 
       * Socket.io connections also need proxying.
       * ws: true enables WebSocket protocol support.
       * EPIPE can occur when backend restarts or client disconnects - handle gracefully.
       */
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,  // Enable WebSocket proxying
        configure: (proxy) => {
          proxy.on('error', (err, _req, _res) => {
            if (err.code === 'ECONNREFUSED' || err.code === 'EPIPE') {
              console.warn('[vite proxy] WebSocket backend unreachable or connection closed:', err.code);
            } else {
              console.error('[vite proxy]', err.message);
            }
          });
          proxy.on('close', () => {
            // Connection closed - normal when backend restarts or client disconnects
          });
        }
      }
    }
  },
  
  /**
   * ============================================================================
   * PRODUCTION BUILD CONFIGURATION
   * ============================================================================
   */
  build: {
    // Output directory for production build
    outDir: 'dist',
    
    /**
     * SOURCE MAPS
     * 
     * Source maps link minified code back to original source.
     * Useful for debugging production issues.
     * 
     * In browser DevTools:
     * - Without sourcemap: Error at line 1, column 50000 (minified)
     * - With sourcemap: Error at Dashboard.jsx line 42
     * 
     * PRODUCTION CONSIDERATION:
     * Sourcemaps expose your original code. Options:
     * - true: Include sourcemaps (helpful for debugging)
     * - false: No sourcemaps (maximum code protection)
     * - 'hidden': Generate but don't reference (upload to error tracking only)
     */
    sourcemap: true
  }
});
