import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // ใบยินยอมแบบไฟล์เสียง/ภาพ ส่งผ่าน server action
    serverActions: { bodySizeLimit: "50mb" },
  },
};

export default nextConfig;
