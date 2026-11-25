import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'

// BASE_PATH is set by the GitHub workflow to "/<repo-name>/" so every link (manifest, icons, home-screen start page)
// is an absolute address that cannot be resolved into the wrong folder. Locally it is "/".
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    // GitHub Pages shows 404.html for any unknown address; making it a copy of the app sends people back in
    { name: 'spa-404', closeBundle() { try { copyFileSync('dist/index.html', 'dist/404.html') } catch { /* dev */ } } },
  ],
})
