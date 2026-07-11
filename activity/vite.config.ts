import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, "..");
  const env = loadEnv(mode, repoRoot, "");
  const apiPort = env.API_PORT || env.PORT || "3000";

  return {
    root: __dirname,
    envDir: repoRoot,
    plugins: [react(), tailwindcss()],
    define: {
      "import.meta.env.VITE_DISCORD_CLIENT_ID": JSON.stringify(env.VITE_DISCORD_CLIENT_ID || env.CLIENT_ID || "")
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(moduleId) {
            const id = moduleId.replaceAll("\\", "/");

            if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/")) {
              return "react";
            }
            if (id.includes("/node_modules/socket.io-client/")) {
              return "realtime";
            }
            if (id.includes("/node_modules/@tanstack/react-query/")) {
              return "query";
            }
            if (id.includes("/node_modules/@dnd-kit/")) {
              return "drag";
            }

            return undefined;
          }
        }
      }
    },
    server: {
      port: 5173,
      strictPort: false,
      allowedHosts: true,
      proxy: {
        "/api": `http://localhost:${apiPort}`,
        "/socket.io": {
          target: `http://localhost:${apiPort}`,
          ws: true
        }
      }
    }
  };
});
