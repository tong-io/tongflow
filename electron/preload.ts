import { contextBridge, ipcRenderer } from "electron";

type DeployResult = { ok: true } | { ok: false; error: string };
type SetupResult = { ok: true } | { ok: false; error: string };

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
    setupModal: async (opts?: { profile?: string | null }): Promise<SetupResult> => {
        try {
            await ipcRenderer.invoke("modal:setup", opts ?? {});
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
    onModalSetupEvent: (
        cb: (evt: unknown) => void,
    ) => {
        const listener = (_: unknown, evt: unknown) => cb(evt);
        ipcRenderer.on("modal:setup:event", listener);
        return () => {
            ipcRenderer.off("modal:setup:event", listener);
        };
    },
});

