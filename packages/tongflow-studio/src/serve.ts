/**
 * The studio's own web server, for hosts that have none to mount it on (the
 * MCP server, `tongflow-studio serve`): the Studio page at `/`, its bundle
 * under `/web/`, and the HTTP routes under the configured prefix.
 *
 * It listens on the loopback interface only and still asks for a token: the
 * routes read and write project files and plugin API keys, and any other
 * process — or web page — on this machine can reach a local port. The link
 * the user opens carries the token once; it is exchanged for a cookie. A
 * client that is not a browser (the Claude Code panel) sends the same token
 * as a bearer credential instead.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
    createServer,
    type IncomingMessage,
    type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, sep } from "node:path";
import { createRouteHandler, routePrefix } from "./http/routes.ts";
import type { ToolEnv } from "./tools/support.ts";

const WEB_TYPES: Record<string, string> = {
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
};

export interface StudioServerOptions {
    env: ToolEnv;
    /** Folder holding the built Studio page (`studio.js` and its chunks). */
    webDir: string;
    /** Port to listen on; 0 or absent lets the system pick a free one. */
    port?: number;
}

export interface StudioServer {
    port: number;
    /** The link to open: carries the access token, plus `query` (e.g. the session to follow). */
    url(query?: Record<string, string>): string;
    close(): Promise<void>;
}

export async function serveStudio(
    options: StudioServerOptions,
): Promise<StudioServer> {
    const { env, webDir } = options;
    const prefix = routePrefix(env.studio.config.httpPrefix);
    const routes = createRouteHandler({ ...env, prefix });
    const token = randomBytes(24).toString("base64url");
    let port = 0;
    // Cookies are scoped by host, not by port: name ours after the port so
    // two studios on this machine do not overwrite each other's.
    const cookie = () => `tongflow_studio_${port}`;

    const handle = async (
        req: IncomingMessage,
        res: ServerResponse,
    ): Promise<void> => {
        // A page on another origin can only reach us under our own name if
        // its DNS answers 127.0.0.1; refuse any Host that is not ours.
        const host = req.headers.host;
        if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`)
            return plain(res, 403, "unknown host");
        const url = new URL(req.url ?? "/", `http://${host}`);
        const offered = url.searchParams.get("token");
        if (url.pathname === "/" && offered !== null) {
            if (!same(offered, token)) return plain(res, 401, "bad token");
            url.searchParams.delete("token");
            res.writeHead(302, {
                location: `/${url.search}`,
                "set-cookie": `${cookie()}=${token}; Path=/; HttpOnly; SameSite=Strict`,
            });
            res.end();
            return;
        }
        const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
        if (
            !same(cookieValue(req, cookie()) ?? "", token) &&
            !same(bearer?.[1] ?? "", token)
        )
            return plain(
                res,
                401,
                "Open the Studio with the link your agent gave you: it carries the access token.",
            );
        if (url.pathname === "/") {
            res.writeHead(200, {
                "content-type": "text/html; charset=utf-8",
                "cache-control": "no-store",
            });
            res.end(PAGE);
            return;
        }
        if (url.pathname === "/favicon.ico") {
            res.writeHead(204);
            res.end();
            return;
        }
        if (url.pathname.startsWith("/web/"))
            return asset(res, webDir, url.pathname.slice("/web/".length));
        if (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))
            return routes(req, res);
        plain(res, 404, "not found");
    };

    const server = createServer((req, res) => {
        handle(req, res).catch(() => {
            if (!res.headersSent) plain(res, 500, "internal error");
            else res.end();
        });
    });
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port ?? 0, "127.0.0.1", resolve);
    });
    port = (server.address() as AddressInfo).port;

    return {
        port,
        url: (query = {}) =>
            `http://127.0.0.1:${port}/?${new URLSearchParams({ token, ...query })}`,
        close: () =>
            new Promise((resolve) => {
                server.close(() => resolve());
                server.closeAllConnections();
            }),
    };
}

function plain(res: ServerResponse, status: number, text: string): void {
    res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    res.end(text);
}

function same(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}

function cookieValue(req: IncomingMessage, name: string): string | undefined {
    for (const part of (req.headers.cookie ?? "").split(";")) {
        const i = part.indexOf("=");
        if (i > 0 && part.slice(0, i).trim() === name)
            return part.slice(i + 1).trim();
    }
    return undefined;
}

/** One file of the built page; names are flat, so anything with a separator is refused. */
async function asset(
    res: ServerResponse,
    webDir: string,
    name: string,
): Promise<void> {
    const type = WEB_TYPES[extname(name)];
    if (!type || normalize(name).includes(sep) || name.includes(".."))
        return plain(res, 404, "not found");
    const path = join(webDir, name);
    const info = await stat(path).catch(() => undefined);
    if (!info?.isFile())
        return plain(
            res,
            404,
            "The Studio page is not built: run `pnpm --filter tongflow-studio build`.",
        );
    res.writeHead(200, {
        "content-type": type,
        "content-length": info.size,
        // File names carry no content hash for the entry; always revalidate.
        "cache-control": "no-cache",
    });
    createReadStream(path).pipe(res);
}

/**
 * The page: a root for the Studio and the palette it reads. The Studio's
 * stylesheet follows dsh's `--dsw-alias-*` tokens when a host defines them;
 * here they are defined for the dark scheme (the fallbacks are the light one).
 */
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TongFlow Studio</title>
<style>
html, body, #root { height: 100%; margin: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", "Noto Sans CJK SC", sans-serif; }
html.dark {
    color-scheme: dark;
    --dsw-alias-bg-base: #16181c;
    --dsw-alias-bg-layer-1: #1d2025;
    --dsw-alias-bg-layer-2: #272b31;
    --dsw-alias-label-primary: #e6e8eb;
    --dsw-alias-label-secondary: #a9b0b8;
    --dsw-alias-label-tertiary: #737b85;
    --dsw-alias-border-l2: #333840;
    --dsw-alias-state-success-primary: #3fb950;
    --dsw-alias-state-error-primary: #f85149;
    --dsw-alias-state-warn-primary: #d29922;
}
</style>
</head>
<body>
<div id="root"></div>
<script type="module" src="/web/studio.js"></script>
</body>
</html>
`;
