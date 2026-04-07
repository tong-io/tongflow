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
        return "max-w-[36rem]";
    }
    if (long >= 3000) {
        return "max-w-[32rem]";
    }
    if (long >= 2400) {
        return "max-w-[28rem]";
    }
    if (long >= 1920) {
        return "max-w-80";
    }
    if (long >= 1440) {
        return "max-w-72";
    }
    return "max-w-64";
}
