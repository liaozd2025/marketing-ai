import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@marketing-ai/database"],
};

export default nextConfig;
