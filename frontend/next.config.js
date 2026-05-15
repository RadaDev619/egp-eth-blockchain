import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["http://192.168.137.1:3000", "http://192.168.137.1:3001"],
  outputFileTracingRoot: path.join(process.cwd(), "..")
};

export default nextConfig;
