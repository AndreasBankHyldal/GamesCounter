import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  // The shared game engine ships as TypeScript source from the workspace, so
  // Next must transpile it instead of expecting a pre-built package.
  transpilePackages: ["@gamescounter/games"],
  // Allow testing over the LAN (e.g. on a phone) by whitelisting the dev host.
  // Set NEXT_ALLOWED_DEV_ORIGIN=<your-LAN-IP> when running `next dev`.
  ...(process.env.NEXT_ALLOWED_DEV_ORIGIN
    ? { allowedDevOrigins: [process.env.NEXT_ALLOWED_DEV_ORIGIN] }
    : {}),
};

export default nextConfig;
