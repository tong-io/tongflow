import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
    output: "standalone",
    transpilePackages: ["@openflow/proprietary"],
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "file.tongflow.com",
                pathname: "/**",
            },
        ],
    },
};

export default withNextIntl(nextConfig);
