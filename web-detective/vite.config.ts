import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { cloudflare } from "@cloudflare/vite-plugin";
import agents from "agents/vite";
import tailwindcss from "@tailwindcss/vite";
import codemode from "@cloudflare/codemode/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare(), agents(), tailwindcss(), codemode()],
})