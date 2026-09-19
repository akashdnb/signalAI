import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Vite inlines VITE_* at BUILD time, so an unset VITE_API_BASE_URL doesn't
  // fail loudly — src/api.ts falls back to http://localhost:3000 and that
  // string is baked into the shipped bundle. A deployed BUI then sends every
  // visitor's browser to their OWN machine, which either refuses the
  // connection or (worse, and what actually happened) reaches a local dev
  // server and produces a confusing downstream error far from the cause.
  //
  // Fail the production build instead, the same rule the server applies to
  // its own externally-facing settings: a missing one stops the build rather
  // than producing a broken artifact. Dev keeps the localhost fallback, which
  // is correct there.
  const env = loadEnv(mode, process.cwd(), '')
  if (mode === 'production' && !env.VITE_API_BASE_URL) {
    throw new Error(
      'VITE_API_BASE_URL is not set. A production build without it bakes ' +
        'http://localhost:3000 into the bundle, pointing the deployed app at ' +
        "each visitor's own machine. Set it to the signalai-server URL and rebuild.",
    )
  }

  return { plugins: [react()] }
})
