export {};

declare global {
    interface Window {
        openflowDesktop?: {
            deployModalWorkers: () => Promise<
                { ok: true } | { ok: false; error: string }
            >;
            setupModal: (opts?: { profile?: string | null }) => Promise<
                { ok: true } | { ok: false; error: string }
            >;
            onModalDeployLog: (cb: (line: string) => void) => () => void;
            onModalSetupEvent: (cb: (evt: unknown) => void) => () => void;
        };
    }
}

