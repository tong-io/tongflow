/**
 * 图片 / 视频节点：按媒体长边像素为 BaseNode 选 max-w（与「分辨率越高预览越宽」一致）。
 * 档位与 image-node / video-node 共用，避免两套魔法数。
 */
export function maxWidthClassForMediaDimensions(
    width: number,
    height: number,
): string {
    const long = Math.max(width, height);
    if (long >= 3600) {
        return "min-w-[14rem] max-w-[14rem]";
    }
    if (long >= 3000) {
        return "min-w-[10rem] max-w-[10rem]";
    }
    if (long >= 2400) {
        return "min-w-[9rem] max-w-[9rem]";
    }
    if (long >= 1920) {
        return "min-w-[8rem] max-w-[8rem]";
    }
    if (long >= 1440) {
        return "min-w-[7rem] max-w-[7rem]";
    }
    return "min-w-[6rem] max-w-[6rem]";
}
