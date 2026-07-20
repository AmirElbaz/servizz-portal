import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // harper.js ships its own web worker + WASM; pre-bundling it breaks the
  // worker/WASM URL resolution, so let Vite serve it as-is.
  optimizeDeps: { exclude: ['harper.js'] },
})
