import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable static export for pages that use Firebase
  output: undefined,
};

export default nextConfig;
