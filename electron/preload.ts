import { contextBridge, ipcRenderer } from "electron";

type DeployResult = { ok: true } | { ok: false; error: string };

contextBridge.exposeInMainWorld("openflowDesktop", {
    deployModalWorkers: async (): Promise<DeployResult> => {
        try {
            await ipcRenderer.invoke("modal:deploy");
            return { ok: true };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    },
    onModalDeployLog: (cb: (line: string) => void) => {
        const listener = (_: unknown, line: string) => cb(line);
        ipcRenderer.on("modal:deploy:log", listener);
        return () => {
            ipcRenderer.off("modal:deploy:log", listener);
        };
    },
});

