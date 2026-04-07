/**
 * 工作流解析工具
 * 用于解析ReactFlow格式的工作流JSON，生成执行顺序规划
 */

import type { Node, Edge } from "@xyflow/react";

// 工作流JSON格式接口
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

// 节点执行状态
export type NodeExecutionStatus =
    | "pending" // 等待执行
    | "ready" // 准备就绪（所有依赖已完成）
    | "running" // 正在执行
    | "completed" // 执行完成
    | "failed" // 执行失败
    | "skipped"; // 跳过

// 节点执行信息
export interface NodeExecutionInfo {
    id: string;
    type: string;
    status: NodeExecutionStatus;
    dependencies: string[]; // 依赖的节点ID
    dependents: string[]; // 被依赖的节点ID（下游节点）
    level: number; // 执行层级（用于确定执行顺序）
    data: Record<string, unknown>;
}

// 执行计划
export interface ExecutionPlan {
    // 按层级分组的节点ID（同一层级可以并行执行）
    levels: string[][];
    // 节点执行信息映射
    nodeInfoMap: Map<string, NodeExecutionInfo>;
    // 开始节点（入度为0）
    startNodes: string[];
    // 结束节点（出度为0）
    endNodes: string[];
    // 总节点数
    totalNodes: number;
    // 总边数
    totalEdges: number;
}

/**
 * 工作流解析器类
 */
export class WorkflowParser {
    private nodes: Node[];
    private edges: Edge[];
    private nodeMap: Map<string, Node>;
    private inDegreeMap: Map<string, number>; // 入度（有多少节点指向它）
    private outDegreeMap: Map<string, number>; // 出度（它指向多少节点）
    private adjacencyList: Map<string, string[]>; // 邻接表（source -> targets）
    private reverseAdjacencyList: Map<string, string[]>; // 反向邻接表（target -> sources）

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
     * 构建图结构
     */
    private buildGraph(): void {
        // 初始化节点映射和度数
        for (const node of this.nodes) {
            this.nodeMap.set(node.id, node);
            this.inDegreeMap.set(node.id, 0);
            this.outDegreeMap.set(node.id, 0);
            this.adjacencyList.set(node.id, []);
            this.reverseAdjacencyList.set(node.id, []);
        }

        // 根据边构建邻接表和度数
        for (const edge of this.edges) {
            const { source, target } = edge;

            // 确保节点存在
            if (!this.nodeMap.has(source) || !this.nodeMap.has(target)) {
                continue;
            }

            // 更新邻接表
            this.adjacencyList.get(source)!.push(target);
            this.reverseAdjacencyList.get(target)!.push(source);

            // 更新度数
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
     * 获取开始节点（入度为0的节点）
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
     * 获取结束节点（出度为0的节点）
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
     * 获取节点的依赖（上游节点）
     */
    getDependencies(nodeId: string): string[] {
        return this.reverseAdjacencyList.get(nodeId) ?? [];
    }

    /**
     * 获取节点的下游节点
     */
    getDependents(nodeId: string): string[] {
        return this.adjacencyList.get(nodeId) ?? [];
    }

    /**
     * 使用拓扑排序生成执行计划
     * 基于Kahn算法，按层级分组（同一层级可以并行执行）
     */
    generateExecutionPlan(): ExecutionPlan {
        const nodeInfoMap = new Map<string, NodeExecutionInfo>();
        const levels: string[][] = [];
        const visited = new Set<string>();

        // 复制入度映射用于计算
        const inDegreeWorkingCopy = new Map(this.inDegreeMap);

        // 初始化节点执行信息
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

        // 第一层：所有入度为0的节点
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

        // BFS遍历，按层级分组
        while (currentLevel.length > 0) {
            levels.push([...currentLevel]);

            const nextLevel: string[] = [];

            for (const nodeId of currentLevel) {
                // 获取所有下游节点
                const dependents = this.getDependents(nodeId);

                for (const dependent of dependents) {
                    // 减少下游节点的入度
                    const newInDegree =
                        (inDegreeWorkingCopy.get(dependent) ?? 1) - 1;
                    inDegreeWorkingCopy.set(dependent, newInDegree);

                    // 如果入度变为0且未访问过，加入下一层
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

        // 检测是否有环（如果有节点未被访问）
        if (visited.size !== this.nodes.length) {
            console.warn(
                "[WorkflowParser] 检测到工作流中存在环，部分节点无法执行",
            );
            // 将未访问的节点标记为跳过
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
     * 获取节点信息
     */
    getNode(nodeId: string): Node | undefined {
        return this.nodeMap.get(nodeId);
    }

    /**
     * 获取所有节点
     */
    getAllNodes(): Node[] {
        return this.nodes;
    }

    /**
     * 获取所有边
     */
    getAllEdges(): Edge[] {
        return this.edges;
    }

    /**
     * 检查工作流是否有效（无环）
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
     * 获取从指定节点到结束的所有路径
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
     * 获取执行顺序的可视化字符串（用于调试）
     */
    getExecutionOrderString(): string {
        const plan = this.generateExecutionPlan();
        const lines: string[] = [];

        lines.push(`=== 工作流执行计划 ===`);
        lines.push(`总节点数: ${plan.totalNodes}`);
        lines.push(`总边数: ${plan.totalEdges}`);
        lines.push(`开始节点: ${plan.startNodes.join(", ")}`);
        lines.push(`结束节点: ${plan.endNodes.join(", ")}`);
        lines.push("");

        for (let i = 0; i < plan.levels.length; i++) {
            const level = plan.levels[i];
            lines.push(`第 ${i + 1} 层 (${level.length} 个节点可并行执行):`);
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
 * 工作流执行器类
 * 负责按照执行计划执行工作流
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

        // 初始化所有节点状态
        for (const [nodeId, info] of this.plan.nodeInfoMap) {
            this.nodeStatusMap.set(nodeId, info.status);
        }

        this.onNodeStatusChange = callbacks?.onNodeStatusChange;
        this.onLevelComplete = callbacks?.onLevelComplete;
        this.onComplete = callbacks?.onComplete;
    }

    /**
     * 获取当前执行计划
     */
    getPlan(): ExecutionPlan {
        return this.plan;
    }

    /**
     * 获取节点状态
     */
    getNodeStatus(nodeId: string): NodeExecutionStatus {
        return this.nodeStatusMap.get(nodeId) ?? "pending";
    }

    /**
     * 更新节点状态
     */
    updateNodeStatus(nodeId: string, status: NodeExecutionStatus): void {
        this.nodeStatusMap.set(nodeId, status);
        this.onNodeStatusChange?.(nodeId, status);
    }

    /**
     * 检查节点是否可以执行（所有依赖都已完成）
     */
    canExecute(nodeId: string): boolean {
        const info = this.plan.nodeInfoMap.get(nodeId);
        if (!info) return false;

        return info.dependencies.every(
            (depId) => this.nodeStatusMap.get(depId) === "completed",
        );
    }

    /**
     * 获取当前可执行的节点
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
     * 检查是否正在运行
     */
    getIsRunning(): boolean {
        return this.isRunning;
    }

    /**
     * 停止执行
     */
    stop(): void {
        this.isStopped = true;
        this.isRunning = false;
    }

    /**
     * 重置执行器状态
     */
    reset(): void {
        this.isStopped = false;
        this.isRunning = false;
        for (const [nodeId] of this.nodeStatusMap) {
            this.nodeStatusMap.set(nodeId, "pending");
        }
    }

    /**
     * 开始执行工作流
     * @param executeNode 执行单个节点的函数，返回Promise
     */
    async execute(
        executeNode: (
            nodeId: string,
            nodeInfo: NodeExecutionInfo,
        ) => Promise<boolean>,
    ): Promise<boolean> {
        if (this.isRunning) {
            console.warn("[WorkflowExecutor] 工作流已在执行中");
            return false;
        }

        this.isRunning = true;
        this.isStopped = false;
        let success = true;

        try {
            // 按层级执行
            for (
                let levelIndex = 0;
                levelIndex < this.plan.levels.length;
                levelIndex++
            ) {
                if (this.isStopped) {
                    console.log("[WorkflowExecutor] 执行被停止");
                    success = false;
                    break;
                }

                const level = this.plan.levels[levelIndex];
                console.log(
                    `[WorkflowExecutor] 执行第 ${levelIndex + 1} 层，共 ${
                        level.length
                    } 个节点`,
                );

                // 将当前层的节点标记为ready
                for (const nodeId of level) {
                    this.updateNodeStatus(nodeId, "ready");
                }

                // 并行执行当前层的所有节点
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
                            console.error(
                                `[WorkflowExecutor] 节点 ${nodeId} 执行失败:`,
                                error,
                            );
                            this.updateNodeStatus(nodeId, "failed");
                            return false;
                        }
                    }),
                );

                // 检查是否有失败的节点
                if (results.some((r) => !r)) {
                    console.warn(
                        `[WorkflowExecutor] 第 ${levelIndex + 1} 层有节点执行失败`,
                    );
                    success = false;
                    // 根据需求决定是否继续执行后续层级
                    // 这里选择继续执行
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
 * 便捷函数：解析工作流并返回执行计划
 */
export function parseWorkflow(
    workflow: WorkflowJSON | { nodes: Node[]; edges: Edge[] },
): ExecutionPlan {
    const parser = new WorkflowParser(workflow);
    return parser.generateExecutionPlan();
}

/**
 * 便捷函数：获取工作流的开始节点
 */
export function getWorkflowStartNodes(
    workflow: WorkflowJSON | { nodes: Node[]; edges: Edge[] },
): string[] {
    const parser = new WorkflowParser(workflow);
    return parser.getStartNodes();
}

/**
 * 便捷函数：获取工作流的结束节点
 */
export function getWorkflowEndNodes(
    workflow: WorkflowJSON | { nodes: Node[]; edges: Edge[] },
): string[] {
    const parser = new WorkflowParser(workflow);
    return parser.getEndNodes();
}

/**
 * 便捷函数：检查工作流是否有效
 */
export function isWorkflowValid(
    workflow: WorkflowJSON | { nodes: Node[]; edges: Edge[] },
): boolean {
    const parser = new WorkflowParser(workflow);
    return parser.isValid();
}
