import type { ReactNode } from "react";

/**
 * Root shell for proprietary / OEM UI (branding, gating, telemetry, etc.).
 * Default OSS build: pass-through. Replace implementations in a private fork or alternate package.
 */
export function ProprietaryAppShell({ children }: { children: ReactNode }) {
    return children;
}
