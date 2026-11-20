import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' para que el build funcione desde cualquier ruta (la app se publica en una subruta).
// En desarrollo, /api se envía a Uvicorn en el puerto 8000.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } } },
})
