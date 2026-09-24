import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig(() => {
  const analyze = process.env.ANALYZE === 'true'

  return {
    plugins: [
      react(),
      analyze && visualizer({
        open: true,
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
        template: 'treemap', // or 'sunburst', 'network'
      }),
    ].filter(Boolean),
    server: {
      port: 5173,
      // Required headers for SharedArrayBuffer support
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        // credentialless (not require-corp) so third-party scripts like Clarity/GA,
        // which don't send Cross-Origin-Resource-Policy, aren't blocked.
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
  }
})
