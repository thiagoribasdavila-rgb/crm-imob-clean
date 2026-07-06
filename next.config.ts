import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // ✅ NOVO PADRÃO (NÃO experimental)
  serverExternalPackages: []
};

export default nextConfig;
