/**
 * Ask the user before a node does something costly the host wants consent
 * for, typically an edge node's first download of a large model (the
 * WebGPU tier-3 models are hundreds of MB). Wraps a {@link NodeExecutor}:
 *
 * - `requires(target)` says whether an invocation needs consent and under
 *   which key (one question per key, e.g. per model, for the gate's lifetime);
 * - `ask(request, signal)` shows the question; questions are asked one at a
 *   time, and concurrent invocations with the same key share one answer;
 *   `signal` aborts when nobody waits for the answer any more (the run was
 *   stopped), so the host can close its dialog;
 * - a refusal fails the invocation with a readable error, so under the
 *   `branch` failure policy only that node's downstream is skipped.
 */

import type { InvokeRequest, InvokeTarget, NodeExecutor } from "./types";

export interface ConsentRequest {
    /** One answer per key (e.g. the model id). */
    key: string;
    /** What the user is asked about, e.g. "Qwen3.5-0.8B (≈810 MB download)". */
    label: string;
    pluginId: string;
    nodeSlot: string;
    model?: string;
    /** Approximate download size, when known. */
    approxMB?: number;
}

export interface ConsentGateOptions {
    requires: (
        target: InvokeTarget & { model?: string },
    ) => Omit<ConsentRequest, "pluginId" | "nodeSlot" | "model"> | undefined;
    ask: (request: ConsentRequest, signal: AbortSignal) => Promise<boolean>;
}

export interface ConsentGate {
    wrap(inner: NodeExecutor): NodeExecutor;
    /** The answer given for `key` so far, `undefined` when not asked yet. */
    decision(key: string): boolean | undefined;
}

function abortError(): Error {
    const e = new Error("The operation was aborted.");
    e.name = "AbortError";
    return e;
}

export function createConsentGate(options: ConsentGateOptions): ConsentGate {
    const decisions = new Map<string, boolean>();
    interface Pending {
        answer: Promise<boolean>;
        waiters: number;
        ac: AbortController;
    }
    const pending = new Map<string, Pending>();
    let queue: Promise<unknown> = Promise.resolve();

    const enqueue = (request: ConsentRequest): Pending => {
        const ac = new AbortController();
        const entry: Pending = {
            waiters: 0,
            ac,
            answer: Promise.resolve(false),
        };
        entry.answer = queue
            .then(async () => {
                if (ac.signal.aborted) throw abortError();
                const ok = await options.ask(request, ac.signal);
                // An answer that arrives after everyone left is not a decision.
                if (ac.signal.aborted) throw abortError();
                decisions.set(request.key, ok);
                return ok;
            })
            .finally(() => {
                if (pending.get(request.key) === entry)
                    pending.delete(request.key);
            });
        queue = entry.answer.catch(() => undefined);
        pending.set(request.key, entry);
        return entry;
    };

    const decide = (
        request: ConsentRequest,
        signal: AbortSignal,
    ): Promise<boolean> => {
        const known = decisions.get(request.key);
        if (known !== undefined) return Promise.resolve(known);
        const entry = pending.get(request.key) ?? enqueue(request);
        entry.waiters++;
        return new Promise<boolean>((resolve, reject) => {
            let settled = false;
            const leave = () => {
                if (--entry.waiters === 0) entry.ac.abort();
            };
            const onAbort = () => {
                if (settled) return;
                settled = true;
                leave();
                reject(abortError());
            };
            if (signal.aborted) return onAbort();
            signal.addEventListener("abort", onAbort, { once: true });
            entry.answer.then(
                (ok) => {
                    signal.removeEventListener("abort", onAbort);
                    if (settled) return;
                    settled = true;
                    entry.waiters--;
                    resolve(ok);
                },
                (err) => {
                    signal.removeEventListener("abort", onAbort);
                    if (settled) return;
                    settled = true;
                    entry.waiters--;
                    reject(err);
                },
            );
        });
    };

    return {
        decision: (key) => decisions.get(key),
        wrap(inner) {
            return {
                ...(inner.check
                    ? { check: (t: InvokeTarget) => inner.check?.(t) }
                    : {}),
                async invoke(req: InvokeRequest) {
                    const need = options.requires({
                        pluginId: req.pluginId,
                        nodeSlot: req.nodeSlot,
                        ...(req.model ? { model: req.model } : {}),
                    });
                    if (need) {
                        const request: ConsentRequest = {
                            ...need,
                            pluginId: req.pluginId,
                            nodeSlot: req.nodeSlot,
                            ...(req.model ? { model: req.model } : {}),
                        };
                        if (!(await decide(request, req.signal))) {
                            throw new Error(
                                `Not run: you declined ${request.label}.`,
                            );
                        }
                    }
                    return inner.invoke(req);
                },
            };
        },
    };
}
