import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
