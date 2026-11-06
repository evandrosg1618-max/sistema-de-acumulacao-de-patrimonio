import { defineConfig } from 'vite'

export default defineConfig({
  root: process.cwd(),
  server: { fs: { allow: ['.'] } },
  build: { outDir: 'dist-homolog' },
})
