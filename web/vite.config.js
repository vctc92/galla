import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev: `npm run dev` on :5173 proxies API calls to FastAPI on :8000.
// Demo/ngrok: `npm run build` and let FastAPI serve web/dist on one origin.
const backend = 'http://localhost:8000'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    proxy: { '/api': backend, '/agent': backend, '/llm': backend },
  },
})
