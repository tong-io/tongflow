export interface AspectRatio {
    value: string;
    label: string;
    width: number;
    height: number;
}

export interface Duration {
    value: string;
    label: string;
}

export interface ResolutionTier {
    value: string;
    label: string;
    scale: number;
}

export const IMAGE_ASPECT_RATIOS: AspectRatio[] = [
    { value: "9:16", label: "portrait", width: 720, height: 1280 },
    { value: "16:9", label: "landscape", width: 1280, height: 720 },
    { value: "1:1", label: "square", width: 1024, height: 1024 },
    { value: "4:3", label: "standard", width: 1024, height: 768 },
    { value: "3:4", label: "verticalStandard", width: 768, height: 1024 },
];

// Resolution tiers scale an aspect ratio's base (1K) dimensions. The picked
// width/height = ratio base × tier scale; there is no separate ABI field.
export const IMAGE_RESOLUTION_TIERS: ResolutionTier[] = [
    { value: "1k", label: "1K", scale: 1 },
    { value: "2k", label: "2K", scale: 2 },
    { value: "4k", label: "4K", scale: 4 },
];

export const VIDEO_ASPECT_RATIOS: AspectRatio[] = [
    { value: "9:16", label: "portrait", width: 576, height: 1024 },
    { value: "16:9", label: "landscape", width: 1024, height: 576 },
    { value: "1:1", label: "square", width: 1024, height: 1024 },
    { value: "4:3", label: "standard", width: 1024, height: 768 },
    { value: "3:4", label: "verticalStandard", width: 768, height: 1024 },
];

export const VIDEO_DURATIONS: Duration[] = [
    { value: "5", label: "5s" },
    { value: "10", label: "10s" },
    { value: "15", label: "15s" },
    { value: "30", label: "30s" },
    { value: "60", label: "1min" },
];

/** Slider range for text/image → video nodes (seconds). */
export const VIDEO_DURATION_MIN = 1;
export const VIDEO_DURATION_MAX = 30;
export const VIDEO_DURATION_DEFAULT = 5;

export function clampVideoDuration(raw: number): number {
    const v = Math.round(raw);
    return Math.max(VIDEO_DURATION_MIN, Math.min(VIDEO_DURATION_MAX, v));
}

/** Icon sizing lookup for aspect ratio thumbnails */
export function getAspectRatioIconSize(ratio: string): {
    width: string;
    height: string;
} {
    switch (ratio) {
        case "16:9":
            return { width: "16px", height: "9px" };
        case "9:16":
            return { width: "8px", height: "14px" };
        case "1:1":
            return { width: "12px", height: "12px" };
        case "4:3":
            return { width: "14px", height: "10px" };
        case "3:4":
            return { width: "10px", height: "13px" };
        default:
            return { width: "12px", height: "12px" };
    }
}
