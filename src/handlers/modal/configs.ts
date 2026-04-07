/**
 * Modal 函数配置映射
 *
 * 将 feature 的 type + function 映射到 Modal 的 appName + functionName。
 * Python Modal 脚本在 modal/ 目录中定义和部署。
 */

export interface ModalFunctionConfig {
    /** 任务类型（对应 features 表的 type 字段） */
    type: string;
    /** 函数名（对应 features 表的 function 字段） */
    function: string;
    /** Modal App 名称 */
    appName: string;
    /** Modal 函数名 */
    modalFunction: string;
}

/**
 * 所有 Modal 函数映射
 *
 * 添加新的 Modal 函数时，只需在此数组中添加一项：
 * 1. 在 modal/ 目录中编写 Python 函数
 * 2. modal deploy 部署
 * 3. 在此处添加映射
 * 4. 在 features 表中添加记录
 */
export const MODAL_FUNCTIONS: ModalFunctionConfig[] = [
    // ==================== CPU 任务 ====================
    {
        type: "cpu",
        function: "ffmpeg",
        appName: "ffmpeg",
        modalFunction: "concat_videos",
    },
    {
        type: "cpu",
        function: "ffmpeg-concat-audios",
        appName: "ffmpeg",
        modalFunction: "concat_audios",
    },
    {
        type: "cpu",
        function: "ffmpeg-separate",
        appName: "ffmpeg",
        modalFunction: "separate_video_audio",
    },
    {
        type: "cpu",
        function: "ffmpeg-merge",
        appName: "ffmpeg",
        modalFunction: "merge_video_audio",
    },
    {
        type: "cpu",
        function: "ffmpeg-remove-audio",
        appName: "ffmpeg",
        modalFunction: "remove_audio",
    },
    {
        type: "cpu",
        function: "ffmpeg-extract-audio",
        appName: "ffmpeg",
        modalFunction: "extract_audio",
    },
    {
        type: "cpu",
        function: "ffmpeg-last-frame",
        appName: "ffmpeg",
        modalFunction: "get_last_frame",
    },
    {
        type: "cpu",
        function: "ffmpeg-first-frame",
        appName: "ffmpeg",
        modalFunction: "get_first_frame",
    },
    {
        type: "cpu",
        function: "whisper",
        appName: "whisper",
        modalFunction: "transcribe",
    },
    {
        type: "cpu",
        function: "crawl4ai",
        appName: "crawl4ai",
        modalFunction: "crawl",
    },
    {
        type: "cpu",
        function: "paddle-ocr",
        appName: "paddle-ocr",
        modalFunction: "paddle_infer",
    },
    {
        type: "cpu",
        function: "docling",
        appName: "docling",
        modalFunction: "parse_document",
    },
    {
        type: "cpu",
        function: "scenedetect",
        appName: "scenedetect",
        modalFunction: "split_video",
    },

    // ==================== GPU 任务 ====================
    // GPU 任务也通过 Modal 部署（开源版不使用 RunningHub）
    // 在 modal/ 目录中添加 GPU 函数后，在此处添加映射
];
