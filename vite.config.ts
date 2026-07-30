import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
<<<<<<< HEAD

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
=======
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
>>>>>>> 036af055591a251da2f70cbc429bf5958a896c9e
})