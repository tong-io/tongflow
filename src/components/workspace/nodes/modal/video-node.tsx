import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo, useRef, useState, useEffect, useLayoutEffect } from "react";
import { Video as VideoIcon, Maximize2, X, Download } from "lucide-react";
import { createPortal } from "react-dom";

import { BaseNode } from "../base/base-node";
import {
    NodeHeader,
    NodeHeaderActions,
    NodeHeaderIcon,
    NodeHeaderMenuAction,
    NodeHeaderTitle,
    NodeHeaderComboAction,
} from "../base/node-header";
import {
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Waterfall } from "@/components/ui/waterfall";
import {
    useR2AsyncLoader,
    useR2AsyncLoaderBatch,
} from "@/hooks/use-r2-async-loader";
import { useTranslations } from "next-intl";

import { maxWidthClassForMediaDimensions } from "./media-node-max-width";

// 单个视频全屏预览modal
const FullScreenVideoModal = ({
    fileKey,
    onClose,
}: {
    fileKey: string;
    onClose: () => void;
}) => {
    const [mounted, setMounted] = useState(false);
    const { url } = useR2AsyncLoader(fileKey, { priority: "high" });

    useEffect(() => {
        setMounted(true);
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "unset";
        };
    }, []);

    if (!mounted) return null;

    const content = (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-11/12 h-5/6 max-h-screen flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-gray-900">
                        Video Preview
                    </h2>
                    <Button size="sm" variant="ghost" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Video with Scrollable Container */}
                <div className="flex-1 flex items-center justify-center bg-white overflow-auto">
                    {url ? (
                        <video
                            src={url}
                            controls
                            className="w-full h-full max-w-full max-h-full"
                            autoPlay
                        >
                            Your browser does not support the video tag.
                        </video>
                    ) : (
                        <div className="text-gray-500">Loading...</div>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

// 多个视频全屏预览modal with 瀑布流
const FullScreenWaterfallModal = ({
    videoKeys,
    onClose,
}: {
    videoKeys: string[];
    onClose: () => void;
}) => {
    const [mounted, setMounted] = useState(false);
    const { urls } = useR2AsyncLoaderBatch(videoKeys, { priority: "normal" });

    useEffect(() => {
        setMounted(true);
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "unset";
        };
    }, []);

    if (!mounted) return null;

    const VideoThumbnail = memo(
        ({
            data: fileKey,
        }: {
            data: string;
            width?: number;
            index?: number;
        }) => {
            const videoRef = useRef<HTMLVideoElement>(null);
            const [videoHeight, setVideoHeight] = useState<number | null>(null);
            const url = urls.get(fileKey);

            useEffect(() => {
                const video = videoRef.current;
                if (!video || !url) return;

                const handleLoadedMetadata = () => {
                    if (video.videoWidth && video.videoHeight) {
                        // 根据视频的实际宽高比计算高度（固定宽度200）
                        const aspectRatio =
                            video.videoHeight / video.videoWidth;
                        setVideoHeight(200 * aspectRatio);
                    }
                };

                video.addEventListener("loadedmetadata", handleLoadedMetadata);

                // 如果视频已经加载过，直接调用
                if (video.readyState >= 1) {
                    handleLoadedMetadata();
                }

                return () => {
                    video.removeEventListener(
                        "loadedmetadata",
                        handleLoadedMetadata,
                    );
                };
            }, [url]);

            const height = videoHeight || 200 * 0.5625; // 默认 16:9

            return (
                <div
                    className="relative overflow-hidden rounded-md border border-gray-300 bg-gray-200 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                    style={{ width: 200, height }}
                    onMouseEnter={(e) => {
                        const video = e.currentTarget.querySelector(
                            "video",
                        ) as HTMLVideoElement;
                        video?.play();
                    }}
                    onMouseLeave={(e) => {
                        const video = e.currentTarget.querySelector(
                            "video",
                        ) as HTMLVideoElement;
                        video?.pause();
                    }}
                >
                    {url ? (
                        <>
                            <video
                                ref={videoRef}
                                src={url}
                                className="h-full w-full object-cover"
                                preload="metadata"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/20 transition-colors">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90">
                                    <VideoIcon className="h-4 w-4 text-gray-800" />
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full w-full">
                            <div className="text-xs text-gray-500">
                                Loading...
                            </div>
                        </div>
                    )}
                </div>
            );
        },
    );

    const content = (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-11/12 h-5/6 max-h-screen flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-gray-900">
                        Videos ({videoKeys.length})
                    </h2>
                    <Button size="sm" variant="ghost" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Waterfall with Scrollable Container */}
                <div className="flex-1 bg-white overflow-auto p-6">
                    <Waterfall
                        items={videoKeys.map((key) => ({ id: key, key }))}
                        render={({ data: { key } }) => (
                            <VideoThumbnail data={key} />
                        )}
                        columnWidth={200}
                        columnGutter={12}
                        rowGutter={12}
                        itemHeightEstimate={200}
                        itemKey={(data) => data.id}
                        maxColumnCount={6}
                    />
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

const VideoNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes.modal");
    const { fileKeys } = (data as { fileKeys?: string[] }) || { fileKeys: [] };
    const keys = fileKeys || [];

    // Refs for video elements
    const singleVideoRef = useRef<HTMLVideoElement>(null);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isWaterfallFullScreen, setIsWaterfallFullScreen] = useState(false);
    const [videoDimensions, setVideoDimensions] = useState<{
        width: number;
        height: number;
    } | null>(null);

    // 为单个视频使用异步加载
    const { url: singleVideoUrl } = useR2AsyncLoader(keys[0], {
        priority: "high",
    });

    // 为多个视频使用批量异步加载
    const { urls: batchUrls } = useR2AsyncLoaderBatch(keys.slice(0, 6), {
        priority: "normal",
    });

    const isSingle = keys.length === 1;
    const count = keys.length;

    useLayoutEffect(() => {
        if (!isSingle || !singleVideoUrl) {
            setVideoDimensions(null);
            return;
        }
        const el = singleVideoRef.current;
        if (!el) {
            return;
        }
        const onLoaded = () => {
            const w = el.videoWidth;
            const h = el.videoHeight;
            if (w > 0 && h > 0) {
                setVideoDimensions({ width: w, height: h });
            }
        };
        el.addEventListener("loadedmetadata", onLoaded);
        if (el.readyState >= 1) {
            onLoaded();
        }
        return () => {
            el.removeEventListener("loadedmetadata", onLoaded);
        };
    }, [isSingle, singleVideoUrl]);

    const handleDownload = (url: string, fileKey: string) => {
        const ext = fileKey.includes(".") ? fileKey.split(".").pop() : "mp4";
        const filename = `video.${ext}`;
        const downloadUrl = `${url}${url.includes("?") ? "&" : "?"}download=${filename}`;
        window.open(downloadUrl, "_blank");
    };

    const nodeMaxWidthClass =
        isSingle && videoDimensions
            ? maxWidthClassForMediaDimensions(
                  videoDimensions.width,
                  videoDimensions.height,
              )
            : undefined;

    return (
        <>
            <BaseNode selected={selected} count={count} className={nodeMaxWidthClass}>
                <NodeHeader>
                    <NodeHeaderIcon>
                        <VideoIcon />
                    </NodeHeaderIcon>
                    <NodeHeaderTitle>
                        {isSingle ? t("video") : t("videos", { count })}
                    </NodeHeaderTitle>
                    <NodeHeaderActions>
                        {isSingle && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setIsFullScreen(true)}
                                title={t("fullScreenPreview")}
                            >
                                <Maximize2 className="h-4 w-4" />
                            </Button>
                        )}
                        {!isSingle && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setIsWaterfallFullScreen(true)}
                                title={t("fullScreenWaterfall")}
                            >
                                <Maximize2 className="h-4 w-4" />
                            </Button>
                        )}
                        <NodeHeaderComboAction
                            onClick={() => console.log("组合模式切换")}
                        />
                        <NodeHeaderMenuAction label={t("moreOptions")}>
                            <DropdownMenuLabel>
                                {t("actions")}
                            </DropdownMenuLabel>
                            {isSingle && singleVideoUrl && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() =>
                                            handleDownload(
                                                singleVideoUrl,
                                                keys[0],
                                            )
                                        }
                                    >
                                        <Download className="h-4 w-4 mr-2" />
                                        {t("download")}
                                    </DropdownMenuItem>
                                </>
                            )}
                        </NodeHeaderMenuAction>
                    </NodeHeaderActions>
                </NodeHeader>

                {/* Content */}
                {isSingle ? (
                    // Single video display
                    <div
                        className="relative w-full nodrag"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        {singleVideoUrl ? (
                            <video
                                ref={singleVideoRef}
                                src={singleVideoUrl}
                                controls
                                controlsList="nodownload"
                                className="w-full h-auto"
                                preload="metadata"
                                onMouseEnter={() =>
                                    singleVideoRef.current?.play()
                                }
                                onMouseLeave={() =>
                                    singleVideoRef.current?.pause()
                                }
                            >
                                Your browser does not support the video tag.
                            </video>
                        ) : (
                            <div className="w-full bg-gray-200 flex items-center justify-center text-gray-500 py-16">
                                {t("loading")}
                            </div>
                        )}
                    </div>
                ) : (
                    // Multiple videos with Grid layout
                    <div
                        className="w-full p-2 nodrag"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <div className="grid grid-cols-3 gap-2">
                            {keys.slice(0, 6).map((key, index) => {
                                // 如果是最后一个格子且还有更多视频，显示 +N
                                const isLastAndMore =
                                    index === 5 && keys.length > 6;
                                const remainingCount = keys.length - 6;
                                const url = batchUrls.get(key);

                                return isLastAndMore ? (
                                    <div
                                        key={`more-${key}`}
                                        className="relative aspect-square overflow-hidden rounded-md border border-gray-300 bg-gray-200 shadow-sm flex items-center justify-center"
                                    >
                                        <div className="text-center">
                                            <div className="text-3xl font-bold text-gray-700">
                                                +{remainingCount}
                                            </div>
                                            <div className="text-xs text-gray-600 mt-1">
                                                {t("more")}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        key={key}
                                        className="relative aspect-square overflow-hidden rounded-md border border-gray-300 bg-gray-200 shadow-sm"
                                        onMouseEnter={(e) => {
                                            const video =
                                                e.currentTarget.querySelector(
                                                    "video",
                                                ) as HTMLVideoElement;
                                            video?.play();
                                        }}
                                        onMouseLeave={(e) => {
                                            const video =
                                                e.currentTarget.querySelector(
                                                    "video",
                                                ) as HTMLVideoElement;
                                            video?.pause();
                                        }}
                                    >
                                        {url ? (
                                            <>
                                                <video
                                                    src={url}
                                                    className="h-full w-full object-cover"
                                                    preload="metadata"
                                                />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90">
                                                        <VideoIcon className="h-3 w-3 text-gray-800" />
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center bg-gray-300">
                                                <div className="text-xs text-gray-500">
                                                    {t("loading")}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <Handle
                    type="target"
                    position={Position.Left}
                    id="a"
                    isConnectable={true}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    id="b"
                    isConnectable={true}
                />
            </BaseNode>

            {/* Full screen modals - rendered outside BaseNode */}
            {isFullScreen && isSingle && keys[0] && (
                <FullScreenVideoModal
                    fileKey={keys[0]}
                    onClose={() => setIsFullScreen(false)}
                />
            )}
            {isWaterfallFullScreen && !isSingle && (
                <FullScreenWaterfallModal
                    videoKeys={keys}
                    onClose={() => setIsWaterfallFullScreen(false)}
                />
            )}
        </>
    );
};

VideoNode.displayName = "VideoNode";

export default memo(VideoNode);
