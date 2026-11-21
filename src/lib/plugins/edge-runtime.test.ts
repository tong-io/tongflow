import {
    createHttpRemoteExecutor,
    type InvokeRequest,
    type RemoteExecutor,
    RemoteExecutorError,
} from "tongflow/engine";
import { describe, expect, it } from "vitest";
import { localizeRemoteRefusals } from "./edge-runtime";

const messages = {
    unavailable: (t: { nodeSlot: string }) => `本地化 501 ${t.nodeSlot}`,
    paymentRequired: (t: { nodeSlot: string }) => `本地化 402 ${t.nodeSlot}`,
};

const request = (): InvokeRequest => ({
    pluginId: "tongflow-modal-x",
    nodeSlot: "image-upscale",
    prompt: {},
    signal: new AbortController().signal,
    onProgress: () => undefined,
});

/** The real HTTP executor over a backend that answers every call with `status`. */
function refusing(status: number, body: Record<string, unknown>) {
    return createHttpRemoteExecutor({
        baseUrl: "",
        fetch: async () =>
            new Response(JSON.stringify(body), {
                status,
                headers: { "content-type": "application/json" },
            }),
    });
}

describe("localizeRemoteRefusals", () => {
    it("rewords a 501 (server nodes unavailable in a browser run)", async () => {
        const remote = localizeRemoteRefusals(
            refusing(501, { error: "cannot run here", code: "failed" }),
            messages,
        );
        const err = await remote.invoke(request()).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(RemoteExecutorError);
        expect((err as RemoteExecutorError).message).toBe(
            "本地化 501 image-upscale",
        );
        expect((err as RemoteExecutorError).status).toBe(501);
        expect((err as RemoteExecutorError).code).toBe("failed");
    });

    it("rewords a 402 (subscription required)", async () => {
        const remote = localizeRemoteRefusals(
            refusing(402, {
                error: "subscription required",
                code: "SUBSCRIPTION_REQUIRED",
            }),
            messages,
        );
        await expect(remote.invoke(request())).rejects.toThrow(
            "本地化 402 image-upscale",
        );
    });

    it("passes other refusals and results through", async () => {
        const missingKey = localizeRemoteRefusals(
            refusing(400, { error: "Set FAL_KEY", code: "missing_api_key" }),
            messages,
        );
        await expect(missingKey.invoke(request())).rejects.toThrow(
            "Set FAL_KEY",
        );
        const ok: RemoteExecutor = {
            invoke: async () => ({ success: true }),
        };
        await expect(
            localizeRemoteRefusals(ok, messages).invoke(request()),
        ).resolves.toEqual({ success: true });
        const plain: RemoteExecutor = {
            invoke: async () => {
                throw new Error("boom");
            },
        };
        await expect(
            localizeRemoteRefusals(plain, messages).invoke(request()),
        ).rejects.toThrow("boom");
    });
});
