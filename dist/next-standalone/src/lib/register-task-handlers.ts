/**
 * 一次性注册所有任务 handlers（LLM、Modal CPU、Z-Image / ACE-Step GPU 等）
 * 由 task-runner 在首次执行任务时动态 import，避免循环依赖。
 */

import { registerLlmHandlers } from "@/handlers/llm/register-handlers";
import { registerModalHandlers } from "@/handlers/modal/caller";
import { registerFfmpegCpuHandlers } from "@/handlers/modal/ffmpeg-cpu";
import { registerScenedetectCpuHandlers } from "@/handlers/modal/scenedetect-cpu";
import { registerAceStepT2sHandler } from "@/handlers/modal/ace-step-t2s";
import {
    registerQwen3TtsDesignT2sHandler,
    registerQwen3TtsReferenceT2sHandler,
} from "@/handlers/modal/qwen3tts-t2s";
import { registerZimageT2iHandler } from "@/handlers/modal/zimage-t2i";
import { registerLtx2VideoHandlers } from "@/handlers/modal/ltx2-video";
import { registerGemma4Handlers } from "@/handlers/modal/gemma4";
import { registerQwen3AsrHandlers } from "@/handlers/modal/qwen3-asr";
import { registerFlux2Klein9bEditHandler } from "@/handlers/modal/flux2-klein9b-edit";
import { registerFlux2Klein9bFusionHandler } from "@/handlers/modal/flux2-klein9b-fusion";
import { registerSeedvr2UpscaleHandlers } from "@/handlers/modal/seedvr2-upscale";

let done = false;

export function ensureHandlersRegistered(): void {
    if (done) return;
    done = true;
    registerLlmHandlers();
    registerModalHandlers();
    registerFfmpegCpuHandlers();
    registerScenedetectCpuHandlers();
    registerZimageT2iHandler();
    registerLtx2VideoHandlers();
    registerGemma4Handlers();
    registerQwen3AsrHandlers();
    registerAceStepT2sHandler();
    registerQwen3TtsDesignT2sHandler();
    registerQwen3TtsReferenceT2sHandler();
    registerFlux2Klein9bEditHandler();
    registerFlux2Klein9bFusionHandler();
    registerSeedvr2UpscaleHandlers();
}
