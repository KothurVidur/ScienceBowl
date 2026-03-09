import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({
  mode
}) => {
  const repoRoot = path.resolve(__dirname, '..');
  const env = loadEnv(mode, repoRoot, '');
  const devBackendUrl = String(env.VITE_DEV_BACKEND_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const devPort = Number(env.VITE_DEV_PORT) || 3000;
  const sourcemap = String(env.VITE_BUILD_SOURCEMAP || (mode === 'production' ? 'false' : 'true')).toLowerCase() === 'true';
  return {
    plugins: [react()],
    envDir: repoRoot,
    server: {
      port: devPort,
      proxy: {
        '/api': {
          target: devBackendUrl,
          changeOrigin: true
        },
        '/socket.io': {
          target: devBackendUrl,
          changeOrigin: true,
          ws: true
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap
    }
  };
});
