/**
 * Modal 统一调用器
 *
 * 使用 modal npm SDK 调用已部署的 Modal 函数。
 * 涵盖 GPU 和 CPU 任务。
 */

import type { TaskData, HandlerResult, TaskHandler } from "@/lib/task-runner";
import { registerHandler } from "@/lib/task-runner";
import { ModalClient } from "modal";
import { MODAL_FUNCTIONS } from "./configs";

/** FFmpeg / scenedetect 由 *-cpu.ts 注册（本地读文件再传字节进 Modal） */
const MODAL_FUNCTIONS_WITHOUT_CPU_BYTE_HANDLERS = MODAL_FUNCTIONS.filter(
    (c) => c.appName !== "ffmpeg" && c.appName !== "scenedetect",
);

/**
 * 通用 Modal 函数调用（顶层 @app.function，入参为单对象 task）
 */
async function callModalFunction(
    appName: string,
    functionName: string,
    task: Record<string, unknown>,
    signal: AbortSignal,
): Promise<HandlerResult> {
    const client = new ModalClient();
    const fn = await client.functions.fromName(appName, functionName);
    const call = await fn.spawn([task]);

    return new Promise<HandlerResult>((resolve, reject) => {
        const onAbort = () => {
            call.cancel({}).catch(() => {});
            reject(new Error("Task cancelled"));
        };

        if (signal.aborted) {
            onAbort();
            return;
        }

        signal.addEventListener("abort", onAbort, { once: true });

        call.get()
            .then((result: HandlerResult) => {
                signal.removeEventListener("abort", onAbort);
                resolve(result);
            })
            .catch((error: Error) => {
                signal.removeEventListener("abort", onAbort);
                reject(error);
            });
    });
}

/**
 * 创建 Modal handler
 */
function createModalHandler(
    appName: string,
    modalFunctionName: string,
): TaskHandler {
    return async (task: TaskData, signal: AbortSignal) => {
        const modalTask = {
            taskId: task.taskId,
            prompt: task.prompt,
            feature: task.feature,
            function: task.function,
        };

        return callModalFunction(appName, modalFunctionName, modalTask, signal);
    };
}

/**
 * 注册所有 Modal handlers
 */
export function registerModalHandlers() {
    for (const config of MODAL_FUNCTIONS_WITHOUT_CPU_BYTE_HANDLERS) {
        const handler = createModalHandler(
            config.appName,
            config.modalFunction,
        );
        registerHandler(config.type, config.function, handler);
    }

    console.log(
        `[Modal] Registered ${MODAL_FUNCTIONS_WITHOUT_CPU_BYTE_HANDLERS.length} Modal handlers (ffmpeg & scenedetect excluded)`,
    );
}
