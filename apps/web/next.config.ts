import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["puppeteer"],
  transpilePackages: [
    "@marketing-ai/database",
    "@marketing-ai/html-renderer",
    "@marketing-ai/template-composition",
    "@marketing-ai/vertical-packs",
  ],
};

export default nextConfig;
