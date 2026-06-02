import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared game engine ships as TypeScript source from the workspace, so
  // Next must transpile it instead of expecting a pre-built package.
  transpilePackages: ["@gamescounter/games"],
};

export default nextConfig;
