import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Dev-only: lets the ngrok tunnel domain load dev-server assets (Next blocks
  // cross-origin /_next/* requests by default). Ignored by production builds.
  allowedDevOrigins: ["george-capitalizable-diego.ngrok-free.dev"],
  reactCompiler: true,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
