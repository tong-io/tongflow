export {};

declare global {
    interface Window {
        openflowDesktop?: {
            deployModalWorkers: () => Promise<
                { ok: true } | { ok: false; error: string }
            >;
            onModalDeployLog: (cb: (line: string) => void) => () => void;
        };
    }
}

