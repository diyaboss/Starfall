import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared/types": resolve(__dirname, "../shared/types.ts"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});