import { type NextRequest, NextResponse } from "next/server";
import { gateSelfHostRequest } from "@/lib/api/self-host-gate";

/**
 * Self-host middleware: every page and API route goes through the access
 * gate. A cloud shell replaces this file with its own session middleware.
 */
export function middleware(request: NextRequest) {
    return gateSelfHostRequest(request) ?? NextResponse.next();
}

export const config = {
    runtime: "nodejs",
    matcher: [
        // Everything except Next.js build assets. No extension-based skips:
        // uploads are served from /api/uploads/<key>.png and must stay gated.
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
