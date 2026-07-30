import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/yt-proxy': {
        target: 'https://pipedapi.privacy.com.de',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/yt-proxy/, ''),
      },
    },
  },
})