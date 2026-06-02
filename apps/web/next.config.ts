import path from "node:path";

import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";

const developmentCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' http://localhost:* ws://localhost:* https: wss:"
].join("; ");

const productionCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https: wss:",
  "upgrade-insecure-requests"
].join("; ");

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: ["@mst/shared"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: isDevelopment ? developmentCsp : productionCsp
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
