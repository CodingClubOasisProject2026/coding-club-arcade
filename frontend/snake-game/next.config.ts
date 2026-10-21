import type { NextConfig } from "next";

const BACKEND = process.env.BACKEND_URL ?? "http://web:8000";

const nextConfig: NextConfig = {
  output: "export",
  cacheComponents: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      { source: "/api/snake/start", destination: `${BACKEND}/snake/start/` },
      {
        source: "/api/snake/session/:id/move",
        destination: `${BACKEND}/snake/session/:id/move/`,
      },
      {
        source: "/api/snake/session/:id/end",
        destination: `${BACKEND}/snake/session/:id/end/`,
      },
      {
        source: "/api/snake/session/:id",
        destination: `${BACKEND}/snake/session/:id/`,
      },
    ];
  },
};

export default nextConfig;