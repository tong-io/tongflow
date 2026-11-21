/**
 * `tongflow/engine` — the browser-side TypeScript workflow engine (platform
 * neutral: no DOM, no Node built-ins).
 *
 * Runs an exported `ExecutableWorkflow` with the Python engine's semantics
 * (bindings and batch fan-out, Asset materialization, output views and batch
 * merging). Node execution is injected: the edge executor runs browser plugins
 * (`tongflow/engine/browser` for Web Workers, {@link createInProcessEdgeExecutor}
 * without), {@link createHttpRemoteExecutor} runs Python plugins on a TongFlow
 * backend, and {@link createCompositeExecutor} routes between them by registry
 * `runtime`.
 * Plugin authors import `tongflow/engine/worker`.
 */

export * from "./abi-schema";
export * from "./assets";
export * from "./base64";
export * from "./bindings";
export * from "./consent-gate";
export * from "./executors/composite";
export {
    EDGE_PLUGIN_PREFIX,
    type ExecutorRegistry,
    pluginRuntimeOf,
} from "./executors/edge-target";
export * from "./executors/in-process";
export * from "./executors/remote";
export * from "./executors/remote-protocol";
export {
    blockingUpstreams,
    buildExecutableGraph,
    downstreamClosure,
    type ExecutableGraph,
    type InputDeps,
    type InputShape,
} from "./graph";
export * from "./host-store";
export * from "./memory-store";
export * from "./output-view";
export { createRunController } from "./run-controller";
export * from "./run-workflow";
export * from "./types";
export type {
    EdgeMethodContext,
    EdgePluginDefinition,
} from "./worker/define-edge-plugin";
