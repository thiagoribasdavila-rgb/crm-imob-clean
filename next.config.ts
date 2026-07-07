cat > next.config.ts <<'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["prisma"],
};

export default nextConfig;
EOF
