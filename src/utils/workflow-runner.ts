/**
 * 工作流执行器
 * 用于在后端执行导出的可执行工作流 JSON
 *
 * 这是一个示例实现，可以在 Node.js 服务端或 Python 后端使用类似逻辑
 */

import type {
    ExecutableWorkflow,
    ExecutableNode,
    DataNode,
    ParamMapping,
    WorkflowInput,
} from "./executable-workflow";

/* ========================================================================== */
/* 类型定义                                                                    */
/* ========================================================================== */

/**
 * 节点执行结果
 */
export interface NodeExecutionResult {
    nodeId: string;
    status: "success" | "failed" | "skipped";
    output?: {
        fileKeys?: string[];
        texts?: string[];
    };
    error?: string;
    duration?: number;
}

/**
 * 工作流执行上下文
 */
export interface ExecutionContext {
    /** 工作流输入数据 */
    inputs: Record<string, unknown>;
    /** 节点输出缓存 */
    nodeOutputs: Map<string, NodeExecutionResult["output"]>;
    /** API 调用函数 */
    callApi: (
        feature: string,
        params: Record<string, unknown>,
    ) => Promise<{
        file_key?: string;
        text?: string;
        texts?: string[];
        file_keys?: string[];
    }>;
    /** URL 转换函数 */
    getR2Url: (fileKey: string) => string;
    /** 进度回调 */
    onProgress?: (nodeId: string, status: string, progress: number) => void;
}

/**
 * 工作流执行结果
 */
export interface WorkflowExecutionResult {
    status: "success" | "failed" | "partial";
    outputs: Record<string, unknown>;
    nodeResults: NodeExecutionResult[];
    totalDuration: number;
    errors: string[];
}

/* ========================================================================== */
/* 执行器实现                                                                  */
/* ========================================================================== */

export class WorkflowRunner {
    private workflow: ExecutableWorkflow;
    private context: ExecutionContext;
    private nodeResults: Map<string, NodeExecutionResult>;

    constructor(workflow: ExecutableWorkflow, context: ExecutionContext) {
        this.workflow = workflow;
        this.context = context;
        this.nodeResults = new Map();
    }

    /**
     * 执行工作流
     */
    async run(): Promise<WorkflowExecutionResult> {
        const startTime = Date.now();
        const errors: string[] = [];

        // 1. 初始化数据节点
        await this.initializeDataNodes();

        // 2. 按层级执行可执行节点
        for (
            let levelIndex = 0;
            levelIndex < this.workflow.executionLevels.length;
            levelIndex++
        ) {
            const level = this.workflow.executionLevels[levelIndex];
            console.log(
                `[WorkflowRunner] Executing level ${levelIndex + 1}/${
                    this.workflow.executionLevels.length
                }, ${level.length} nodes`,
            );

            // 并行执行同层级节点
            const levelResults = await Promise.all(
                level.map(async (nodeId) => {
                    // 跳过数据节点
                    if (this.isDataNode(nodeId)) {
                        return null;
                    }

                    const execNode = this.workflow.executableNodes.find(
                        (n) => n.id === nodeId,
                    );
                    if (!execNode) {
                        return null;
                    }

                    try {
                        const result = await this.executeNode(execNode);
                        this.nodeResults.set(nodeId, result);
                        this.context.nodeOutputs.set(nodeId, result.output);
                        return result;
                    } catch (error) {
                        const errorMsg =
                            error instanceof Error
                                ? error.message
                                : String(error);
                        errors.push(`Node ${nodeId} failed: ${errorMsg}`);
                        const failedResult: NodeExecutionResult = {
                            nodeId,
                            status: "failed",
                            error: errorMsg,
                        };
                        this.nodeResults.set(nodeId, failedResult);
                        return failedResult;
                    }
                }),
            );

            // 检查是否有失败的节点
            const failedNodes = levelResults.filter(
                (r) => r?.status === "failed",
            );
            if (failedNodes.length > 0) {
                console.warn(
                    `[WorkflowRunner] ${failedNodes.length} nodes failed in level ${
                        levelIndex + 1
                    }`,
                );
            }
        }

        // 3. 收集输出
        const outputs = this.collectOutputs();

        // 4. 计算总耗时
        const totalDuration = Date.now() - startTime;

        // 5. 确定最终状态
        const allResults = Array.from(this.nodeResults.values());
        const hasFailure = allResults.some((r) => r.status === "failed");
        const hasSuccess = allResults.some((r) => r.status === "success");

        let status: WorkflowExecutionResult["status"];
        if (!hasFailure) {
            status = "success";
        } else if (hasSuccess) {
            status = "partial";
        } else {
            status = "failed";
        }

        return {
            status,
            outputs,
            nodeResults: allResults,
            totalDuration,
            errors,
        };
    }

    /**
     * 初始化数据节点
     */
    private async initializeDataNodes(): Promise<void> {
        for (const dataNode of this.workflow.dataNodes) {
            let output: NodeExecutionResult["output"];

            if (dataNode.isInput) {
                // 从输入获取数据
                const inputValue = this.context.inputs[dataNode.inputName!];
                if (dataNode.dataType === "text") {
                    output = {
                        texts: Array.isArray(inputValue)
                            ? (inputValue as string[])
                            : [inputValue as string],
                    };
                } else {
                    output = {
                        fileKeys: Array.isArray(inputValue)
                            ? (inputValue as string[])
                            : [inputValue as string],
                    };
                }
            } else if (dataNode.staticData) {
                // 使用静态数据
                output = {
                    texts: dataNode.staticData.texts,
                    fileKeys: dataNode.staticData.fileKeys,
                };
            } else {
                output = {};
            }

            this.nodeResults.set(dataNode.id, {
                nodeId: dataNode.id,
                status: "success",
                output,
            });
            this.context.nodeOutputs.set(dataNode.id, output);
        }
    }

    /**
     * 判断是否为数据节点
     */
    private isDataNode(nodeId: string): boolean {
        return this.workflow.dataNodes.some((n) => n.id === nodeId);
    }

    /**
     * 执行单个节点
     */
    private async executeNode(
        node: ExecutableNode,
    ): Promise<NodeExecutionResult> {
        const startTime = Date.now();

        this.context.onProgress?.(node.id, "running", 0);

        // 解析参数
        const params = await this.resolveParams(node);

        // 如果是批量执行
        if (
            node.isBatch &&
            node.batchParam &&
            Array.isArray(params[node.batchParam])
        ) {
            const batchItems = params[node.batchParam] as unknown[];
            const results: { file_key?: string; text?: string }[] = [];

            for (let i = 0; i < batchItems.length; i++) {
                const itemParams = {
                    ...params,
                    [node.batchParam]: batchItems[i],
                };
                const result = await this.context.callApi(
                    node.feature,
                    itemParams,
                );
                results.push(result);

                this.context.onProgress?.(
                    node.id,
                    "running",
                    ((i + 1) / batchItems.length) * 100,
                );
            }

            // 合并批量结果
            const output: NodeExecutionResult["output"] = {};
            if (node.outputField === "fileKeys") {
                output.fileKeys = results
                    .map((r) => r.file_key!)
                    .filter(Boolean);
            } else {
                output.texts = results.map((r) => r.text!).filter(Boolean);
            }

            return {
                nodeId: node.id,
                status: "success",
                output,
                duration: Date.now() - startTime,
            };
        }

        // 单次执行
        const result = await this.context.callApi(node.feature, params);

        const output: NodeExecutionResult["output"] = {};
        if (node.outputField === "fileKeys") {
            output.fileKeys =
                result.file_keys ?? (result.file_key ? [result.file_key] : []);
        } else {
            output.texts = result.texts ?? (result.text ? [result.text] : []);
        }

        this.context.onProgress?.(node.id, "completed", 100);

        return {
            nodeId: node.id,
            status: "success",
            output,
            duration: Date.now() - startTime,
        };
    }

    /**
     * 解析节点参数
     */
    private async resolveParams(
        node: ExecutableNode,
    ): Promise<Record<string, unknown>> {
        const params: Record<string, unknown> = {};

        for (const [paramName, mapping] of Object.entries(node.inputMapping)) {
            const value = await this.resolveParamValue(mapping);
            if (value !== undefined) {
                params[paramName] = value;
            }
        }

        return params;
    }

    /**
     * 解析单个参数值
     */
    private async resolveParamValue(mapping: ParamMapping): Promise<unknown> {
        switch (mapping.source) {
            case "static":
                return mapping.value;

            case "input":
                return this.context.inputs[mapping.inputName!];

            case "upstream": {
                const upstreamOutput = this.context.nodeOutputs.get(
                    mapping.nodeId!,
                );
                if (!upstreamOutput) {
                    console.warn(
                        `[WorkflowRunner] Upstream node ${mapping.nodeId} has no output`,
                    );
                    return undefined;
                }

                // 解析字段路径
                let value = this.getFieldValue(upstreamOutput, mapping.field!);

                // 应用数组索引
                if (mapping.arrayIndex !== undefined && Array.isArray(value)) {
                    value = value[mapping.arrayIndex];
                }

                // 应用转换
                if (
                    mapping.transform === "getR2Url" &&
                    typeof value === "string"
                ) {
                    value = this.context.getR2Url(value);
                } else if (
                    mapping.transform === "getR2Url" &&
                    Array.isArray(value)
                ) {
                    value = value.map((v) =>
                        typeof v === "string" ? this.context.getR2Url(v) : v,
                    );
                }

                return value;
            }

            case "config":
                // 配置值应该已经在导出时解析为 static
                return mapping.value;

            default:
                return undefined;
        }
    }

    /**
     * 从对象获取字段值
     */
    private getFieldValue(
        obj: Record<string, unknown>,
        field: string,
    ): unknown {
        // 处理数组索引，如 "fileKeys[0]"
        const arrayMatch = field.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
            const [, key, indexStr] = arrayMatch;
            const arr = obj[key];
            if (Array.isArray(arr)) {
                return arr[parseInt(indexStr, 10)];
            }
            return undefined;
        }

        return obj[field];
    }

    /**
     * 收集工作流输出
     */
    private collectOutputs(): Record<string, unknown> {
        const outputs: Record<string, unknown> = {};

        for (const outputDef of this.workflow.outputs) {
            const nodeOutput = this.context.nodeOutputs.get(outputDef.nodeId);
            if (nodeOutput) {
                outputs[outputDef.name] = this.getFieldValue(
                    nodeOutput as Record<string, unknown>,
                    outputDef.field,
                );
            }
        }

        return outputs;
    }
}

/* ========================================================================== */
/* 便捷函数                                                                    */
/* ========================================================================== */

/**
 * 执行可执行工作流
 */
export async function runWorkflow(
    workflow: ExecutableWorkflow,
    inputs: Record<string, unknown>,
    options: {
        callApi: ExecutionContext["callApi"];
        getR2Url?: ExecutionContext["getR2Url"];
        onProgress?: ExecutionContext["onProgress"];
    },
): Promise<WorkflowExecutionResult> {
    const context: ExecutionContext = {
        inputs,
        nodeOutputs: new Map(),
        callApi: options.callApi,
        getR2Url:
            options.getR2Url ?? ((key) => `https://r2.example.com/${key}`),
        onProgress: options.onProgress,
    };

    const runner = new WorkflowRunner(workflow, context);
    return runner.run();
}

/**
 * 验证工作流输入
 */
export function validateWorkflowInputs(
    workflow: ExecutableWorkflow,
    inputs: Record<string, unknown>,
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const inputDef of workflow.inputs) {
        if (inputDef.required && !(inputDef.name in inputs)) {
            errors.push(`Missing required input: ${inputDef.name}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * 获取工作流所需的输入定义
 */
export function getWorkflowInputSchema(
    workflow: ExecutableWorkflow,
): WorkflowInput[] {
    return workflow.inputs;
}
