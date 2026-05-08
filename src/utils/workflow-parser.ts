/**
 * Workflow parsing utility
 * Parses ReactFlow-format workflow JSON and generates an execution order plan
 */

import type { Edge, Node } from "@xyflow/react";
import { logger } from "@/lib/logger";

// Workflow JSON format interface
export interface WorkflowJSON {
    name: string;
    description?: string;
    flow: {
        nodes: Node[];
        edges: Edge[];
    };
    exportedAt?: string;
    version?: string;
}

// Node execution status
export type NodeExecutionStatus =
    | "pending" // Waiting to execute
    | "ready" // Ready (all dependencies have completed)
    | "running" // Executing
    | "completed" // Execution completed
    | "failed" // Execution failed
    | "skipped"; // Skipped

// Node execution info
export interface NodeExecutionInfo {
    id: string;
    type: string;
    status: NodeExecutionStatus;
    dependencies: string[]; // IDs of dependency nodes
    dependents: string[]; // IDs of dependent nodes (downstream nodes)
    level: number; // Execution level (used to determine execution order)
    data: Record<string, unknown>;
}

// Execution plan
export interface ExecutionPlan {
    // Node IDs grouped by level (nodes at the same level can execute in parallel)
    levels: string[][];
    // Node execution info mapping
    nodeInfoMap: Map<string, NodeExecutionInfo>;
    // Start nodes (in-degree 0)
    startNodes: string[];
    // End nodes (out-degree 0)
    endNodes: string[];
    // Total number of nodes
    totalNodes: number;
    // Total number of edges
    totalEdges: number;
}

/**
 * Workflow parser class
 */
export class WorkflowParser {
    private nodes: Node[];
    private edges: Edge[];
    private nodeMap: Map<string, Node>;
    private inDegreeMap: Map<string, number>; // In-degree (how many nodes point to this node)
    private outDegreeMap: Map<string, number>; // Out-degree (how many nodes this node points to)
    private adjacencyList: Map<string, string[]>; // Adjacency list (source -> targets)
    private reverseAdjacencyList: Map<string, string[]>; // Reverse adjacency list (target -> sources)

    constructor(workflow: WorkflowJSON | { nodes: Node[]; edges: Edge[] }) {
        if ("flow" in workflow) {
            this.nodes = workflow.flow.nodes;
            this.edges = workflow.flow.edges;
        } else {
            this.nodes = workflow.nodes;
            this.edges = workflow.edges;
        }

        this.nodeMap = new Map();
        this.inDegreeMap = new Map();
        this.outDegreeMap = new Map();
        this.adjacencyList = new Map();
        this.reverseAdjacencyList = new Map();

        this.buildGraph();
    }

    /**
     * Build the graph structure
     */
    private buildGraph(): void {
        // Initialize the node map and degree counts
        for (const node of this.nodes) {
            this.nodeMap.set(node.id, node);
            this.inDegreeMap.set(node.id, 0);
            this.outDegreeMap.set(node.id, 0);
            this.adjacencyList.set(node.id, []);
            this.reverseAdjacencyList.set(node.id, []);
        }

        // Build the adjacency list and degree counts from edges
        for (const edge of this.edges) {
            const { source, target } = edge;

            // Ensure the nodes exist
            if (!this.nodeMap.has(source) || !this.nodeMap.has(target)) {
                continue;
            }

            // Update the adjacency list
            this.adjacencyList.get(source)!.push(target);
            this.reverseAdjacencyList.get(target)!.push(source);

            // Update degree counts
            this.outDegreeMap.set(
                source,
                (this.outDegreeMap.get(source) ?? 0) + 1,
            );
            this.inDegreeMap.set(
                target,
                (this.inDegreeMap.get(target) ?? 0) + 1,
            );
        }
    }

    /**
     * Get start nodes (nodes with in-degree 0)
     */
    getStartNodes(): string[] {
        const startNodes: string[] = [];
        for (const [nodeId, inDegree] of this.inDegreeMap) {
            if (inDegree === 0) {
                startNodes.push(nodeId);
            }
        }
        return startNodes;
    }

    /**
     * Get end nodes (nodes with out-degree 0)
     */
    getEndNodes(): string[] {
        const endNodes: string[] = [];
        for (const [nodeId, outDegree] of this.outDegreeMap) {
            if (outDegree === 0) {
                endNodes.push(nodeId);
            }
        }
        return endNodes;
    }

    /**
     * Get a node's dependencies (upstream nodes)
     */
    getDependencies(nodeId: string): string[] {
        return this.reverseAdjacencyList.get(nodeId) ?? [];
    }

    /**
     * Get a node's downstream nodes
     */
    getDependents(nodeId: string): string[] {
        return this.adjacencyList.get(nodeId) ?? [];
    }

    /**
     * Generate an execution plan using topological sort
     * Based on Kahn's algorithm, grouped by level (same level can execute in parallel)
     */
    generateExecutionPlan(): ExecutionPlan {
        const nodeInfoMap = new Map<string, NodeExecutionInfo>();
        const levels: string[][] = [];
        const visited = new Set<string>();

        // Copy the in-degree map for computation
        const inDegreeWorkingCopy = new Map(this.inDegreeMap);

        // Initialize node execution info
        for (const node of this.nodes) {
            nodeInfoMap.set(node.id, {
                id: node.id,
                type: node.type ?? "unknown",
                status: "pending",
                dependencies: this.getDependencies(node.id),
                dependents: this.getDependents(node.id),
                level: -1,
                data: (node.data as Record<string, unknown>) ?? {},
            });
        }

        // First level: all nodes with in-degree 0
        let currentLevel: string[] = [];
        for (const [nodeId, inDegree] of inDegreeWorkingCopy) {
            if (inDegree === 0) {
                currentLevel.push(nodeId);
                visited.add(nodeId);
                const info = nodeInfoMap.get(nodeId);
                if (info) {
                    info.level = 0;
                }
            }
        }

        let levelIndex = 0;

        // BFS traversal, grouped by level
        while (currentLevel.length > 0) {
            levels.push([...currentLevel]);

            const nextLevel: string[] = [];

            for (const nodeId of currentLevel) {
                // Get all downstream nodes
                const dependents = this.getDependents(nodeId);

                for (const dependent of dependents) {
                    // Decrease the in-degree of the downstream node
                    const newInDegree =
                        (inDegreeWorkingCopy.get(dependent) ?? 1) - 1;
                    inDegreeWorkingCopy.set(dependent, newInDegree);

                    // If the in-degree drops to 0 and the node has not been visited, add it to the next level
                    if (newInDegree === 0 && !visited.has(dependent)) {
                        nextLevel.push(dependent);
                        visited.add(dependent);
                        const info = nodeInfoMap.get(dependent);
                        if (info) {
                            info.level = levelIndex + 1;
                        }
                    }
                }
            }

            currentLevel = nextLevel;
            levelIndex++;
        }

        // Detect cycles (if any nodes were not visited)
        if (visited.size !== this.nodes.length) {
            logger.warn(
                "[WorkflowParser] A cycle was detected in the workflow; some nodes cannot execute",
            );
            // Mark unvisited nodes as skipped
            for (const node of this.nodes) {
                if (!visited.has(node.id)) {
                    const info = nodeInfoMap.get(node.id);
                    if (info) {
                        info.status = "skipped";
                    }
                }
            }
        }

        return {
            levels,
            nodeInfoMap,
            startNodes: this.getStartNodes(),
            endNodes: this.getEndNodes(),
            totalNodes: this.nodes.length,
            totalEdges: this.edges.length,
        };
    }

    /**
     * Get node info
     */
    getNode(nodeId: string): Node | undefined {
        return this.nodeMap.get(nodeId);
    }

    /**
     * Get all nodes
     */
    getAllNodes(): Node[] {
        return this.nodes;
    }

    /**
     * Get all edges
     */
    getAllEdges(): Edge[] {
        return this.edges;
    }

    /**
     * Check whether the workflow is valid (no cycles)
     */
    isValid(): boolean {
        const plan = this.generateExecutionPlan();
        const executedCount = plan.levels.reduce(
            (sum, level) => sum + level.length,
            0,
        );
        return executedCount === this.nodes.length;
    }

    /**
     * Get all paths from a given node to the end
     */
    getPathsToEnd(startNodeId: string): string[][] {
        const paths: string[][] = [];
        const endNodes = new Set(this.getEndNodes());

        const dfs = (currentId: string, currentPath: string[]) => {
            currentPath.push(currentId);

            if (endNodes.has(currentId)) {
                paths.push([...currentPath]);
            } else {
                const dependents = this.getDependents(currentId);
                for (const dependent of dependents) {
                    dfs(dependent, currentPath);
                }
            }

            currentPath.pop();
        };

        dfs(startNodeId, []);
        return paths;
    }

    /**
     * Get a visualized string of the execution order (for debugging)
     */
    getExecutionOrderString(): string {
        const plan = this.generateExecutionPlan();
        const lines: string[] = [];

        lines.push(`=== Workflow Execution Plan ===`);
        lines.push(`Total nodes: ${plan.totalNodes}`);
        lines.push(`Total edges: ${plan.totalEdges}`);
        lines.push(`Start nodes: ${plan.startNodes.join(", ")}`);
        lines.push(`End nodes: ${plan.endNodes.join(", ")}`);
        lines.push("");

        for (let i = 0; i < plan.levels.length; i++) {
            const level = plan.levels[i];
            lines.push(
                `Level ${i + 1} (${level.length} nodes can execute in parallel):`,
            );
            for (const nodeId of level) {
                const info = plan.nodeInfoMap.get(nodeId);
                if (info) {
                    const node = this.getNode(nodeId);
                    const typeName = node?.type ?? "unknown";
                    lines.push(
                        `  - [${typeName}] ${nodeId.substring(0, 8)}...`,
                    );
                }
            }
            lines.push("");
        }

        return lines.join("\n");
    }
}

/**
 * Workflow executor class
 * Responsible for executing the workflow according to the execution plan
 */
export class WorkflowExecutor {
    private parser: WorkflowParser;
    private plan: ExecutionPlan;
    private nodeStatusMap: Map<string, NodeExecutionStatus>;
    private onNodeStatusChange?: (
        nodeId: string,
        status: NodeExecutionStatus,
    ) => void;
    private onLevelComplete?: (level: number, nodeIds: string[]) => void;
    private onComplete?: (success: boolean) => void;
    private isRunning: boolean = false;
    private isStopped: boolean = false;

    constructor(
        workflow: WorkflowJSON | { nodes: Node[]; edges: Edge[] },
        callbacks?: {
            onNodeStatusChange?: (
                nodeId: string,
                status: NodeExecutionStatus,
            ) => void;
            onLevelComplete?: (level: number, nodeIds: string[]) => void;
            onComplete?: (success: boolean) => void;
        },
    ) {
        this.parser = new WorkflowParser(workflow);
        this.plan = this.parser.generateExecutionPlan();
        this.nodeStatusMap = new Map();

        // Initialize all node statuses
        for (const [nodeId, info] of this.plan.nodeInfoMap) {
            this.nodeStatusMap.set(nodeId, info.status);
        }

        this.onNodeStatusChange = callbacks?.onNodeStatusChange;
        this.onLevelComplete = callbacks?.onLevelComplete;
        this.onComplete = callbacks?.onComplete;
    }

    /**
     * Get the current execution plan
     */
    getPlan(): ExecutionPlan {
        return this.plan;
    }

    /**
     * Get node status
     */
    getNodeStatus(nodeId: string): NodeExecutionStatus {
        return this.nodeStatusMap.get(nodeId) ?? "pending";
    }

    /**
     * Update node status
     */
    updateNodeStatus(nodeId: string, status: NodeExecutionStatus): void {
        this.nodeStatusMap.set(nodeId, status);
        this.onNodeStatusChange?.(nodeId, status);
    }

    /**
     * Check whether a node can execute (all dependencies have completed)
     */
    canExecute(nodeId: string): boolean {
        const info = this.plan.nodeInfoMap.get(nodeId);
        if (!info) return false;

        return info.dependencies.every(
            (depId) => this.nodeStatusMap.get(depId) === "completed",
        );
    }

    /**
     * Get the currently executable nodes
     */
    getReadyNodes(): string[] {
        const readyNodes: string[] = [];
        for (const [nodeId, status] of this.nodeStatusMap) {
            if (status === "pending" && this.canExecute(nodeId)) {
                readyNodes.push(nodeId);
            }
        }
        return readyNodes;
    }

    /**
     * Check whether execution is in progress
     */
    getIsRunning(): boolean {
        return this.isRunning;
    }

    /**
     * Stop execution
     */
    stop(): void {
        this.isStopped = true;
        this.isRunning = false;
    }

    /**
     * Reset the executor state
     */
    reset(): void {
        this.isStopped = false;
        this.isRunning = false;
        for (const [nodeId] of this.nodeStatusMap) {
            this.nodeStatusMap.set(nodeId, "pending");
        }
    }

    /**
     * Start executing the workflow
     * @param executeNode Function to execute a single node, returns a Promise
     */
    async execute(
        executeNode: (
            nodeId: string,
            nodeInfo: NodeExecutionInfo,
        ) => Promise<boolean>,
    ): Promise<boolean> {
        if (this.isRunning) {
            logger.warn("[WorkflowExecutor] Workflow is already executing");
            return false;
        }

        this.isRunning = true;
        this.isStopped = false;
        let success = true;

        try {
            // Execute level by level
            for (
                let levelIndex = 0;
                levelIndex < this.plan.levels.length;
                levelIndex++
            ) {
                if (this.isStopped) {
                    logger.debug("[WorkflowExecutor] Execution stopped");
                    success = false;
                    break;
                }

                const level = this.plan.levels[levelIndex];
                logger.debug(
                    `[WorkflowExecutor] Executing level ${levelIndex + 1}, total ${
                        level.length
                    } nodes`,
                );

                // Mark nodes in the current level as ready
                for (const nodeId of level) {
                    this.updateNodeStatus(nodeId, "ready");
                }

                // Execute all nodes in the current level in parallel
                const results = await Promise.all(
                    level.map(async (nodeId) => {
                        if (this.isStopped) return false;

                        const info = this.plan.nodeInfoMap.get(nodeId);
                        if (!info) return false;

                        this.updateNodeStatus(nodeId, "running");

                        try {
                            const result = await executeNode(nodeId, info);
                            this.updateNodeStatus(
                                nodeId,
                                result ? "completed" : "failed",
                            );
                            return result;
                        } catch (error) {
                            logger.error(
                                `[WorkflowExecutor] Node ${nodeId} execution failed:`,
                                error,
                            );
                            this.updateNodeStatus(nodeId, "failed");
                            return false;
                        }
                    }),
                );

                // Check whether any nodes failed
                if (results.some((r) => !r)) {
                    logger.warn(
                        `[WorkflowExecutor] Level ${levelIndex + 1} has nodes that failed execution`,
                    );
                    success = false;
                    // Decide whether to continue executing subsequent levels
                    // Here we choose to continue
                }

                this.onLevelComplete?.(levelIndex, level);
            }
        } finally {
            this.isRunning = false;
            this.onComplete?.(success);
        }

        return success;
    }
}

/**
 * Convenience function: parse a workflow and return the execution plan
 */
export function parseWorkflow(
    workflow: WorkflowJSON | { nodes: Node[]; edges: Edge[] },
): ExecutionPlan {
    const parser = new WorkflowParser(workflow);
    return parser.generateExecutionPlan();
}

/**
 * Convenience function: get the start nodes of a workflow
 */
export function getWorkflowStartNodes(
    workflow: WorkflowJSON | { nodes: Node[]; edges: Edge[] },
): string[] {
    const parser = new WorkflowParser(workflow);
    return parser.getStartNodes();
}

/**
 * Convenience function: get the end nodes of a workflow
 */
export function getWorkflowEndNodes(
    workflow: WorkflowJSON | { nodes: Node[]; edges: Edge[] },
): string[] {
    const parser = new WorkflowParser(workflow);
    return parser.getEndNodes();
}

/**
 * Convenience function: check whether a workflow is valid
 */
export function isWorkflowValid(
    workflow: WorkflowJSON | { nodes: Node[]; edges: Edge[] },
): boolean {
    const parser = new WorkflowParser(workflow);
    return parser.isValid();
}
