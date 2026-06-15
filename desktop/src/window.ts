import { BrowserWindow } from "electron";
import { logFilePath, recentLogs } from "./logging";

const SPLASH_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;font-family:-apple-system,Segoe UI,Roboto,sans-serif;
    background:#0b0b0f;color:#e8e8ea;display:flex;align-items:center;justify-content:center}
  .box{text-align:center;padding:24px;width:100%}
  .title{font-size:20px;font-weight:600;margin-bottom:6px}
  .sub{font-size:12px;color:#9a9aa2;margin-bottom:20px}
  .status{font-size:12px;color:#b9b9c2;height:16px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 24px}
  .bar{margin:16px auto 0;width:220px;height:3px;border-radius:3px;background:#23232b;overflow:hidden}
  .bar>i{display:block;height:100%;width:40%;border-radius:3px;background:#6d6df0;
    animation:slide 1.1s ease-in-out infinite}
  @keyframes slide{0%{margin-left:-40%}100%{margin-left:100%}}
</style></head><body>
  <div class="box">
    <div class="title">TongFlow</div>
    <div class="sub">multi-modal AIGC studio</div>
    <div class="status" id="status">Starting…</div>
    <div class="bar"><i></i></div>
  </div>
</body></html>`;

export function createSplash(): BrowserWindow {
    const win = new BrowserWindow({
        width: 460,
        height: 300,
        frame: false,
        resizable: false,
        center: true,
        show: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    void win.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(SPLASH_HTML)}`,
    );
    return win;
}

/** Push a status line into the splash (best-effort; ignored if window gone). */
export function setSplashStatus(win: BrowserWindow | null, text: string): void {
    if (!win || win.isDestroyed()) return;
    const safe = JSON.stringify(text);
    win.webContents
        .executeJavaScript(
            `(()=>{const e=document.getElementById('status');if(e)e.textContent=${safe};})()`,
        )
        .catch(() => undefined);
}

export function createMainWindow(url: string): BrowserWindow {
    const win = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 960,
        minHeight: 640,
        show: false,
        backgroundColor: "#0b0b0f",
        webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    win.once("ready-to-show", () => win.show());
    win.webContents.on(
        "did-fail-load",
        (_event, errorCode, errorDescription, validatedURL) => {
            // -3 (ERR_ABORTED) fires on normal in-app navigations; not an error.
            if (errorCode === -3) return;
            showErrorPage(
                win,
                "Failed to load TongFlow",
                `${validatedURL || url} — ${errorDescription} (${errorCode})`,
            );
        },
    );
    win.webContents.on("render-process-gone", (_event, details) => {
        showErrorPage(
            win,
            "TongFlow page crashed",
            `Renderer process gone: ${details.reason} (exit code ${details.exitCode})`,
        );
    });
    void win.loadURL(url);
    return win;
}

/**
 * Replace the window content with a diagnostic page: error message, log file
 * location, and the tail of the main-process log — so a broken distributed
 * build produces an actionable report instead of a black screen.
 */
export function showErrorPage(
    win: BrowserWindow | null,
    title: string,
    detail: string,
): void {
    if (!win || win.isDestroyed()) return;
    const esc = (s: string) =>
        s
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;min-height:100%;font-family:-apple-system,Segoe UI,Roboto,sans-serif;
    background:#0b0b0f;color:#e8e8ea}
  .wrap{max-width:760px;margin:48px auto;padding:0 24px}
  h1{font-size:20px;margin:0 0 8px}
  .detail{font-size:13px;color:#f0b4b4;margin-bottom:16px;word-break:break-all}
  .meta{font-size:12px;color:#9a9aa2;margin-bottom:8px}
  code{color:#b9b9c2;word-break:break-all}
  pre{background:#15151c;border:1px solid #23232b;border-radius:6px;padding:12px;
    font-size:11px;line-height:1.5;color:#b9b9c2;white-space:pre-wrap;word-break:break-all;
    max-height:50vh;overflow:auto}
</style></head><body>
  <div class="wrap">
    <h1>${esc(title)}</h1>
    <div class="detail">${esc(detail)}</div>
    <div class="meta">Full log: <code>${esc(logFilePath())}</code></div>
    <div class="meta">Recent log output:</div>
    <pre>${esc(recentLogs(60)) || "(no log output captured)"}</pre>
  </div>
</body></html>`;
    void win.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
    if (!win.isVisible()) win.show();
}
