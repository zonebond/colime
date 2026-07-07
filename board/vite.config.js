/* eslint-env node */
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function resolveGitSha() {
  if (process.env.VITE_GIT_SHA) return process.env.VITE_GIT_SHA
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch (_) {
    return 'unknown'
  }
}

const buildInfo = {
  sha: resolveGitSha(),
  builtAt: new Date().toISOString(),
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'emit-version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify(buildInfo, null, 2),
        })
      },
    },
  ],
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo),
  },
  server: {
    proxy: {
      '/ravens': {
        target: 'http://127.0.0.1:5090',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/unit/**/*.test.{js,jsx}'],
  },
})
