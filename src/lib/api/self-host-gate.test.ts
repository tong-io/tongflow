import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { AUTH_COOKIE, gateSelfHostRequest } from "./self-host-gate";

const TOKEN = "s3cret-token";

function req(
    url: string,
    init: { host?: string; headers?: Record<string, string> } = {},
) {
    const u = new URL(url);
    return new NextRequest(u, {
        headers: { host: init.host ?? u.host, ...init.headers },
    });
}

describe("gateSelfHostRequest without a token", () => {
    it("serves loopback hosts", () => {
        for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
            const r = req("http://localhost:3000/api/settings/env", { host });
            expect(gateSelfHostRequest(r, undefined)).toBeNull();
        }
    });

    it("refuses any other host, including a spoofed forwarded-for", () => {
        const r = req("http://10.0.0.5:3000/api/plugins/install", {
            headers: { "x-forwarded-for": "127.0.0.1" },
        });
        expect(gateSelfHostRequest(r, undefined)?.status).toBe(403);
    });
});

describe("gateSelfHostRequest with a token", () => {
    const protectedPaths = [
        "/api/plugins/install",
        "/api/task/create",
        "/api/task/wait?taskId=x",
        "/api/settings/env",
        "/api/uploads/abc.png",
        "/",
    ];

    it("rejects requests without credentials, even from localhost", () => {
        for (const p of protectedPaths) {
            const r = req(`http://localhost:3000${p}`);
            expect(gateSelfHostRequest(r, TOKEN)?.status).toBe(401);
        }
    });

    it("accepts the cookie or a bearer header", () => {
        const viaCookie = req("http://h:3000/api/task/create", {
            headers: { cookie: `${AUTH_COOKIE}=${TOKEN}` },
        });
        const viaBearer = req("http://h:3000/api/task/create", {
            headers: { authorization: `Bearer ${TOKEN}` },
        });
        expect(gateSelfHostRequest(viaCookie, TOKEN)).toBeNull();
        expect(gateSelfHostRequest(viaBearer, TOKEN)).toBeNull();
    });

    it("rejects a wrong token", () => {
        const r = req("http://h:3000/api/settings/env", {
            headers: { authorization: "Bearer nope" },
        });
        expect(gateSelfHostRequest(r, TOKEN)?.status).toBe(401);
        const q = req("http://h:3000/?token=nope");
        expect(gateSelfHostRequest(q, TOKEN)?.status).toBe(401);
    });

    it("exchanges ?token= for a cookie and strips it from the URL", async () => {
        const res = gateSelfHostRequest(
            req(`http://h:3000/workspace?id=1&token=${TOKEN}`),
            TOKEN,
        );
        expect(res?.status).toBe(200);
        expect(await res?.text()).toContain('url=/workspace?id=1"');
        const cookie = res?.cookies.get(AUTH_COOKIE);
        expect(cookie?.value).toBe(TOKEN);
        expect(cookie?.httpOnly).toBe(true);
        expect(cookie?.sameSite).toBe("strict");
    });

    it("leaves self-authenticated routes to their own token checks", () => {
        for (const p of ["/api/engine-assets", "/api/task/webhook"]) {
            const r = req(`http://h:3000${p}`);
            expect(gateSelfHostRequest(r, TOKEN)).toBeNull();
            expect(gateSelfHostRequest(r, undefined)).toBeNull();
        }
    });
});
