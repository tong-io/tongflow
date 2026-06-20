import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
    output: "standalone",
    // NOTE: do not add outputFileTracingExcludes for data//plugins//desktop
    // here — its glob matching is unanchored, so "data/**" (even as
    // "./data/**") also strips next/dist/lib/metadata/** from the standalone
    // server and breaks it at startup. Tracing may pull those mutable dev
    // dirs into .next/standalone on dev machines; the desktop assemble script
    // (desktop/scripts/assemble-app.mjs) skips them when bundling instead.
    webpack: (config) => {
        // @sparkjsdev/spark (Gaussian-splat renderer) references its WASM module
        // via `new URL(...)`. Webpack's URL asset parser mis-resolves it and
        // breaks the build, so disable that parsing — Spark resolves the module
        // itself at runtime. (Official fix from sparkjsdev/spark-react-nextjs.)
        config.module.parser = {
            ...config.module.parser,
            javascript: {
                ...config.module.parser?.javascript,
                url: false,
            },
        };
        return config;
    },
};

export default withNextIntl(nextConfig);
