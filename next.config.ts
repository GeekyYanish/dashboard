import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this, Turbopack walks up and finds a
  // stray package-lock.json in the home directory and warns on every start.
  turbopack: { root: path.resolve(process.cwd()) },
};

export default nextConfig;
