/**
 * Persisted legacy plugin ids → current registry ids (historical tasks / old UI defaults).
 * Kept in a standalone module so `task-runner` PRs avoid formatter churn on this large literal.
 */

export const LEGACY_PLUGIN_ID_MAP: Record<string, string> = {
    "tongflow-llm-gemini": "tongflow-llm-gemini-text",
    "tongflow-llm-openai": "tongflow-llm-openai-text",
    "tongflow-llm-openrouter-free": "tongflow-llm-openrouter-free",
    "openrouter-free": "tongflow-llm-openrouter-free",
    "tongflow-modal-Qwen3-ASR": "tongflow-modal-qwen3asr",
    "tongflow-modal-cpu-crawl4ai-app": "tongflow-modal-crawl4ai",
    "tongflow-modal-cpu-docling": "tongflow-modal-docling",
    "tongflow-modal-cpu-ffmpeg": "tongflow-modal-ffmpeg",
    "tongflow-modal-cpu-paddle": "tongflow-modal-paddle",
    "tongflow-modal-cpu-pyscenedetect": "tongflow-modal-pyscenedetect",
    "tongflow-modal-cpu-whisper": "tongflow-modal-whisper",
    "tongflow-modal-gpu-ace-step": "tongflow-modal-ace-step",
    "tongflow-modal-gpu-color-fix-lab": "tongflow-modal-color-fix-lab",
    "tongflow-modal-gpu-color_fix_lab": "tongflow-modal-color-fix-lab",
    "tongflow-modal-gpu-ernie-image": "tongflow-modal-ernie-image",
    "tongflow-modal-gpu-flux2-klein9b": "tongflow-modal-flux2-klein9b",
    "tongflow-modal-gpu-gemma4": "tongflow-modal-gemma4",
    "tongflow-modal-gpu-ltx": "tongflow-modal-ltx",
    "tongflow-modal-gpu-qwen3asr": "tongflow-modal-qwen3asr",
    "tongflow-modal-gpu-qwen3tts": "tongflow-modal-qwen3tts",
    "tongflow-modal-gpu-seedvr2": "tongflow-modal-seedvr2",
    "tongflow-modal-gpu-z-image": "tongflow-modal-z-image",
    "ace-step": "tongflow-modal-ace-step",
    "color-fix-lab": "tongflow-modal-color-fix-lab",
    "crawl4ai": "tongflow-modal-crawl4ai",
    "docling": "tongflow-modal-docling",
    "ernie-image": "tongflow-modal-ernie-image",
    "ffmpeg": "tongflow-modal-ffmpeg",
    "flux2-klein9b": "tongflow-modal-flux2-klein9b",
    "gemini-text": "tongflow-llm-gemini-text",
    "gemma4": "tongflow-modal-gemma4",
    "ltx": "tongflow-modal-ltx",
    "openai-text": "tongflow-llm-openai-text",
    "paddle": "tongflow-modal-paddle",
    "pyscenedetect": "tongflow-modal-pyscenedetect",
    "qwen3asr": "tongflow-modal-qwen3asr",
    "qwen3tts": "tongflow-modal-qwen3tts",
    "seedvr2": "tongflow-modal-seedvr2",
    "whisper": "tongflow-modal-whisper",
    "z-image": "tongflow-modal-z-image",
};

export function normalizeLegacyPluginId(pluginId: string): string {
    return LEGACY_PLUGIN_ID_MAP[pluginId] ?? pluginId;
}
