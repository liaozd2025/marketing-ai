import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@marketing-ai/database",
    "@marketing-ai/vertical-packs",
  ],
};

export default nextConfig;
