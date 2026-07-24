import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.131", "192.168.11.35", "10.226.179.13", "10.18.209.159"],
  reactStrictMode: true,
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
