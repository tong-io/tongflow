import { app, type BrowserWindow, dialog } from "electron";
import { findFreePort } from "./free-port";
import { ensureUserDirs } from "./fs-setup";
import { ensurePythonEnv } from "./python-manager";
import { startServer, stopServer } from "./server-manager";
import { createMainWindow, createSplash, setSplashStatus } from "./window";

let mainWindow: BrowserWindow | null = null;
let splash: BrowserWindow | null = null;

// Single-instance: focus the existing window instead of starting a 2nd server.
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(boot).catch(fatal);
}

async function boot(): Promise<void> {
    splash = createSplash();

    const log = (line: string) => {
        // Surface key progress on the splash and keep a full trace in the console.
        console.log(line);
        setSplashStatus(splash, line);
    };

    try {
        ensureUserDirs();

        // First run materializes the Python venv (can take a minute online).
        await ensurePythonEnv(log);

        const port = await findFreePort();
        log("Starting TongFlow server…");
        await startServer(port, (line) => console.log(line));

        mainWindow = createMainWindow(`http://127.0.0.1:${port}`);
        mainWindow.on("closed", () => {
            mainWindow = null;
        });
        mainWindow.once("ready-to-show", () => {
            if (splash && !splash.isDestroyed()) splash.close();
            splash = null;
        });

        void maybeCheckForUpdates();
    } catch (err) {
        fatal(err);
    }
}

/** electron-updater is optional; only runs in packaged builds with a feed. */
async function maybeCheckForUpdates(): Promise<void> {
    if (!app.isPackaged) return;
    try {
        const { autoUpdater } = await import("electron-updater");
        await autoUpdater.checkForUpdatesAndNotify();
    } catch (e) {
        console.warn("[updater] skipped:", e);
    }
}

function fatal(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[tongflow] fatal:", err);
    if (splash && !splash.isDestroyed()) splash.close();
    dialog.showErrorBox("TongFlow failed to start", message);
    app.quit();
}

// The app is a thin shell over a single local server; closing the window means
// quitting (and tearing down the server) on every platform, macOS included.
app.on("window-all-closed", () => {
    stopServer();
    app.quit();
});

app.on("before-quit", stopServer);
