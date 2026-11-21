/**
 * `createRunController()`: the handle a caller keeps to pause, resume, skip
 * and re-implement nodes of a running workflow. The controller itself only
 * forwards to the run it is attached to (`runWorkflow` attaches it
 * synchronously and detaches it when the run ends); all the state lives in
 * the scheduler.
 */

import type { NodeImplementation, NodeRunStatus, RunController } from "./types";

/** What a run exposes to its controller (internal). */
export interface RunControlTarget {
    setPaused(paused: boolean): void;
    skipNode(nodeId: string): boolean;
    replaceImplementation(nodeId: string, impl: NodeImplementation): boolean;
    nodeStatus(nodeId: string): NodeRunStatus | undefined;
}

class Controller implements RunController {
    #paused = false;
    #target: RunControlTarget | null = null;

    get paused(): boolean {
        return this.#paused;
    }

    get active(): boolean {
        return this.#target !== null;
    }

    pause(): boolean {
        if (this.#paused) return false;
        this.#paused = true;
        this.#target?.setPaused(true);
        return true;
    }

    resume(): boolean {
        if (!this.#paused) return false;
        this.#paused = false;
        this.#target?.setPaused(false);
        return true;
    }

    skipNode(nodeId: string): boolean {
        return this.#target?.skipNode(nodeId) ?? false;
    }

    replaceImplementation(nodeId: string, impl: NodeImplementation): boolean {
        if (!impl || typeof impl.pluginId !== "string" || !impl.pluginId) {
            return false;
        }
        return this.#target?.replaceImplementation(nodeId, impl) ?? false;
    }

    nodeStatus(nodeId: string): NodeRunStatus | undefined {
        return this.#target?.nodeStatus(nodeId);
    }

    attach(target: RunControlTarget): void {
        if (this.#target) {
            throw new Error("RunController is already attached to a run");
        }
        this.#target = target;
    }

    detach(target: RunControlTarget): void {
        if (this.#target === target) this.#target = null;
    }
}

export function createRunController(): RunController {
    return new Controller();
}

/** Attach `controller` to a run; returns the detach function (internal). */
export function attachRunController(
    controller: RunController,
    target: RunControlTarget,
): () => void {
    if (!(controller instanceof Controller)) {
        throw new Error(
            "RunWorkflowOptions.controller must come from createRunController()",
        );
    }
    controller.attach(target);
    return () => controller.detach(target);
}
