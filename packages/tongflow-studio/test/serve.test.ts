import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StudioApi } from "../src/api.ts";
import { studioConfig } from "../src/config.ts";
import { type StudioServer, serveStudio } from "../src/serve.ts";
import { Studio } from "../src/studio.ts";

/**
 * The Studio page's server reads and writes project files and plugin API
 * keys, and it listens on a port any process or web page on the machine can
 * reach. What stands between them is the token in the link, the Host check
 * and the same-origin check — each must refuse on its own.
 */

let root: string;
let server: StudioServer;
let origin: string;
let cookie: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "tongflow-studio-serve-"));
    const web = join(root, "web");
    await mkdir(web);
    await writeFile(join(web, "studio.js"), "export {};\n");
    await writeFile(join(root, "secret.js"), "export const key = 1;\n");
    const studio = new Studio({
        config: studioConfig({ studioRoot: root, autoInstallOfficial: false }),
    });
    await studio.init();
    server = await serveStudio({
        env: { studio, api: new StudioApi(studio) },
        webDir: web,
    });
    origin = `http://127.0.0.1:${server.port}`;
    const exchange = await fetch(server.url({ session: "s1" }), {
        redirect: "manual",
    });
    expect(exchange.status).toBe(302);
    // The token leaves the address bar; the rest of the query stays.
    expect(exchange.headers.get("location")).toBe("/?session=s1");
    cookie = (exchange.headers.get("set-cookie") ?? "").split(";")[0];
});

afterEach(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
});

const get = (path: string, headers: Record<string, string> = {}) =>
    fetch(`${origin}${path}`, { headers, redirect: "manual" });

describe("serveStudio", () => {
    it("serves the page, its bundle and the routes to the holder of the cookie", async () => {
        const page = await get("/", { cookie });
        expect(page.status).toBe(200);
        expect(await page.text()).toContain("/web/studio.js");
        const bundle = await get("/web/studio.js", { cookie });
        expect(bundle.headers.get("content-type")).toMatch(/^text\/javascript/);
        const projects = await get("/tongflow/projects", { cookie });
        expect(await projects.json()).toEqual([]);
    });

    it("refuses everything without the token", async () => {
        expect((await get("/")).status).toBe(401);
        expect((await get("/web/studio.js")).status).toBe(401);
        expect((await get("/tongflow/projects")).status).toBe(401);
        expect((await get("/?token=wrong")).status).toBe(401);
        expect(
            (await get("/tongflow/projects", { cookie: `${cookie}x` })).status,
        ).toBe(401);
    });

    it("takes the token as a bearer credential from a client that is not a browser", async () => {
        const token = new URL(server.url()).searchParams.get("token");
        const ok = await get("/tongflow/projects", {
            authorization: `Bearer ${token}`,
        });
        expect(ok.status).toBe(200);
        const bad = await get("/tongflow/projects", {
            authorization: "Bearer nope",
        });
        expect(bad.status).toBe(401);
    });

    it("names its cookie after its port, so two studios do not share one", () => {
        expect(cookie.startsWith(`tongflow_studio_${server.port}=`)).toBe(true);
    });

    it("refuses a request that reached it under another host name", async () => {
        // fetch does not let a caller choose Host; node:http does.
        const status = (host: string) =>
            new Promise<number | undefined>((resolve, reject) => {
                request(
                    { port: server.port, path: "/", headers: { cookie, host } },
                    (res) => {
                        res.resume();
                        resolve(res.statusCode);
                    },
                )
                    .on("error", reject)
                    .end();
            });
        expect(await status(`evil.example:${server.port}`)).toBe(403);
        expect(await status(`localhost:${server.port}`)).toBe(200);
    });

    it("refuses a state-changing request from another origin", async () => {
        const res = await fetch(`${origin}/tongflow/projects`, {
            method: "POST",
            headers: {
                cookie,
                origin: "http://evil.example",
                "content-type": "application/json",
            },
            body: JSON.stringify({ title: "x" }),
        });
        expect(res.status).toBe(403);
    });

    it("serves only flat bundle files", async () => {
        expect((await get("/web/..%2Fsecret.js", { cookie })).status).toBe(404);
        expect((await get("/web/studio.html", { cookie })).status).toBe(404);
        expect((await get("/web/missing.js", { cookie })).status).toBe(404);
    });
});
