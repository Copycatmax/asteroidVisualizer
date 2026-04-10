import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/')
          if (!normalizedId.includes('node_modules')) return undefined

          if (
            normalizedId.includes('/three/')
          ) {
            return 'three-core'
          }

          if (normalizedId.includes('/@react-three/fiber/')) {
            return 'r3f-core'
          }

          if (normalizedId.includes('/react-reconciler/')) {
            return 'react-reconciler'
          }

          if (normalizedId.includes('/scheduler/')) {
            return 'react-scheduler'
          }

          if (normalizedId.includes('/its-fine/')) {
            return 'r3f-utils'
          }

          if (normalizedId.includes('/@react-three/drei/')) {
            return 'drei'
          }

          if (normalizedId.includes('/@react-three/postprocessing/') || normalizedId.includes('/postprocessing/')) {
            return 'postprocessing'
          }

          if (normalizedId.includes('/react/') || normalizedId.includes('/react-dom/')) {
            return 'react-core'
          }

          if (normalizedId.includes('/gsap/')) {
            return 'animation'
          }

          return 'vendor'
        },
      },
    },
  },
})
