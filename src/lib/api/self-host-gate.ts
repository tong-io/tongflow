import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Self-host access gate, run by src/middleware.ts in front of every page and
 * API route. Plugin install, task dispatch and the settings store all live
 * behind it, so an unauthenticated network client must never reach them.
 *
 * - `TONGFLOW_AUTH_TOKEN` set: every request must carry the token, as the
 *   `tongflow_token` cookie (set by opening any page with `?token=<token>`)
 *   or an `Authorization: Bearer <token>` header.
 * - Unset: only loopback Host headers are served. Paired with the loopback
 *   bind of `pnpm dev` / `pnpm start`, this keeps a token-less install
 *   reachable from this machine only (and stops DNS-rebinding pages). The
 *   Docker image always runs with a token (see docker-entrypoint.sh).
 *
 * The client address is not used: Next fills `x-forwarded-for` only when the
 * caller didn't send one, so it is spoofable.
 */

export const AUTH_COOKIE = "tongflow_token";

// Routes that authenticate their own callers with per-run tokens.
const SELF_AUTHENTICATED_PATHS = ["/api/engine-assets", "/api/task/webhook"];

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function tokensEqual(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}

function hostnameOf(host: string | null): string {
    if (!host) return "";
    // Strip the port; keep IPv6 brackets ("[::1]:3000" -> "[::1]").
    return host.replace(/:\d+$/, "").toLowerCase();
}

function deny(request: NextRequest, status: number, message: string) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json({ error: message }, { status });
    }
    return new NextResponse(message, {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
}

/** Returns a response to short-circuit with, or null to let the request through. */
export function gateSelfHostRequest(
    request: NextRequest,
    token: string | undefined = process.env.TONGFLOW_AUTH_TOKEN,
): NextResponse | null {
    const { pathname, searchParams } = request.nextUrl;
    if (SELF_AUTHENTICATED_PATHS.some((p) => pathname.startsWith(p))) {
        return null;
    }

    if (!token) {
        if (LOOPBACK_HOSTS.has(hostnameOf(request.headers.get("host")))) {
            return null;
        }
        return deny(
            request,
            403,
            "This TongFlow server has no access token. Set TONGFLOW_AUTH_TOKEN to serve it beyond localhost.",
        );
    }

    // `?token=` exchange: remember the token in a cookie, then drop it from
    // the URL so it doesn't linger in history or get shared.
    const queryToken = searchParams.get("token");
    if (queryToken !== null && tokensEqual(queryToken, token)) {
        const clean = new URLSearchParams(searchParams);
        clean.delete("token");
        const query = clean.toString();
        const target = query ? `${pathname}?${query}` : pathname;
        // A relative client-side hop rather than a 307: Next rewrites a
        // middleware redirect onto its own origin ("localhost" for
        // 127.0.0.1), and that host switch would drop the cookie set below.
        const res = new NextResponse(
            `<!doctype html><meta http-equiv="refresh" content="0;url=${encodeURI(target)}">`,
            {
                headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Cache-Control": "no-store",
                    "Referrer-Policy": "no-referrer",
                },
            },
        );
        res.cookies.set(AUTH_COOKIE, token, {
            httpOnly: true,
            sameSite: "strict",
            secure: request.nextUrl.protocol === "https:",
            path: "/",
            maxAge: 60 * 60 * 24 * 365,
        });
        return res;
    }

    const header = request.headers.get("authorization") ?? "";
    const presented = header.startsWith("Bearer ")
        ? header.slice(7)
        : (request.cookies.get(AUTH_COOKIE)?.value ?? "");
    if (presented && tokensEqual(presented, token)) return null;

    return deny(
        request,
        401,
        "Unauthorized. Open this server once with ?token=<TONGFLOW_AUTH_TOKEN> (the Docker image prints that link in its logs).",
    );
}
