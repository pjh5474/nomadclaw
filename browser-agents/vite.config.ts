import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { cloudflare } from "@cloudflare/vite-plugin";
import codemode from "@cloudflare/codemode/vite";
import agents from "agents/vite";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [codemode(), agents(), react(), tailwindcss(), cloudflare()],
});
