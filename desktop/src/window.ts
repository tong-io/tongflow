import { BrowserWindow } from "electron";

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
    void win.loadURL(url);
    return win;
}
