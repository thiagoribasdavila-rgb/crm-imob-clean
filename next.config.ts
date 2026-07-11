import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@supabase/supabase-js"],
  reactStrictMode: true,
};

export default nextConfig;
