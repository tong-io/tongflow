import { Handle, Position } from "@xyflow/react";
import { Download, Maximize2, Video as VideoIcon, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Waterfall } from "@/components/ui/waterfall";
import {
    useFileAsyncLoader,
    useFileAsyncLoaderBatch,
} from "@/hooks/use-file-async-loader";
import { logger } from "@/lib/logger";
import type { RfDataNodeProps } from "@/types/nodes";
import { BaseNodeShell } from "../base/base-node-shell";
import {
    NodeHeader,
    NodeHeaderActions,
    NodeHeaderComboAction,
    NodeHeaderIcon,
    NodeHeaderMenuAction,
    NodeHeaderTitle,
} from "../base/node-header";
import { proportionalMediaNodeWidthPx } from "./media-node-max-width";
import { ModalityPlaceholder } from "./modality-placeholder";

type VideoNodeRfProps = RfDataNodeProps<"videoNode">;

// Single-video fullscreen modal
const FullScreenVideoModal = ({
    fileKey,
    onClose,
}: {
    fileKey: string;
    onClose: () => void;
}) => {
    const t = useTranslations("Workspace.nodes.modal");
    const [mounted, setMounted] = useState(false);
    const { url } = useFileAsyncLoader(fileKey, { priority: "high" });

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
                        {t("videoPreview")}
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
                            className="max-w-full max-h-full object-contain"
                            autoPlay
                        >
                            Your browser does not support the video tag.
                        </video>
                    ) : (
                        <div className="text-gray-500">{t("loading")}</div>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

// Multi-video gallery modal
const FullScreenWaterfallModal = ({
    videoKeys,
    onClose,
}: {
    videoKeys: string[];
    onClose: () => void;
}) => {
    const t = useTranslations("Workspace.nodes.modal");
    const [mounted, setMounted] = useState(false);
    const { urls } = useFileAsyncLoaderBatch(videoKeys, { priority: "normal" });

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
                        // Derive tile height using intrinsic ratio at fixed 200px width
                        const aspectRatio =
                            video.videoHeight / video.videoWidth;
                        setVideoHeight(200 * aspectRatio);
                    }
                };

                video.addEventListener("loadedmetadata", handleLoadedMetadata);

                // Shortcut when metadata cached
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

            const height = videoHeight || 200 * 0.5625; // Default portrait baseline 16:9

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
                                {t("loading")}
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
                        {t("videos", { count: videoKeys.length })}
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

// Grid thumbnail that falls back to a neutral placeholder on load failure.
const VideoGridThumb = ({
    url,
    loadingLabel,
}: {
    url: string | undefined;
    loadingLabel: string;
}) => {
    const [errored, setErrored] = useState(false);

    if (url && !errored) {
        return (
            <>
                <video
                    src={url}
                    className="h-full w-full object-cover"
                    preload="metadata"
                    onError={() => setErrored(true)}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90">
                        <VideoIcon className="h-3 w-3 text-gray-800" />
                    </div>
                </div>
            </>
        );
    }

    if (errored) {
        return <ModalityPlaceholder modality="video" variant="thumb" />;
    }

    return (
        <div className="h-full w-full flex items-center justify-center bg-gray-300">
            <div className="text-xs text-gray-500">{loadingLabel}</div>
        </div>
    );
};

const VideoNode = ({ selected, data }: VideoNodeRfProps) => {
    const t = useTranslations("Workspace.nodes.modal");
    const keys: string[] = data.fileKeys ?? [];

    // Refs for video elements
    const singleVideoRef = useRef<HTMLVideoElement>(null);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isWaterfallFullScreen, setIsWaterfallFullScreen] = useState(false);
    const [videoDimensions, setVideoDimensions] = useState<{
        width: number;
        height: number;
    } | null>(null);
    const [videoError, setVideoError] = useState(false);

    // Async embed one remote video preview
    const { url: singleVideoUrl } = useFileAsyncLoader(keys[0], {
        priority: "high",
    });

    // Batch hydrate many clips
    const { urls: batchUrls } = useFileAsyncLoaderBatch(keys.slice(0, 6), {
        priority: "normal",
    });

    const isSingle = keys.length === 1;
    const count = keys.length;

    // Mirror image-node trick: detached video for intrinsic ratio before mount
    useEffect(() => {
        if (!isSingle || !singleVideoUrl) {
            setVideoDimensions(null);
            setVideoError(false);
            return;
        }

        setVideoError(false);
        const video = document.createElement("video");
        video.preload = "metadata";

        const onLoadedMetadata = () => {
            const w = video.videoWidth;
            const h = video.videoHeight;
            if (w > 0 && h > 0) {
                setVideoDimensions({ width: w, height: h });
            } else {
                setVideoDimensions(null);
            }
        };

        const onError = () => {
            setVideoDimensions(null);
            setVideoError(true);
        };

        video.addEventListener("loadedmetadata", onLoadedMetadata);
        video.addEventListener("error", onError);
        video.src = singleVideoUrl;

        return () => {
            video.removeEventListener("loadedmetadata", onLoadedMetadata);
            video.removeEventListener("error", onError);
            video.removeAttribute("src");
            video.load();
        };
    }, [isSingle, singleVideoUrl]);

    const handleDownload = (url: string, fileKey: string) => {
        const ext = fileKey.includes(".") ? fileKey.split(".").pop() : "mp4";
        const filename = `video.${ext}`;
        const downloadUrl = `${url}${url.includes("?") ? "&" : "?"}download=${filename}`;
        window.open(downloadUrl, "_blank");
    };

    const mediaNodeWidthPx =
        isSingle && videoDimensions
            ? proportionalMediaNodeWidthPx(
                  videoDimensions.width,
                  videoDimensions.height,
              )
            : undefined;

    return (
        <>
            <BaseNodeShell
                selected={selected}
                count={count}
                className={
                    mediaNodeWidthPx != null ? "min-w-0 max-w-none" : undefined
                }
                style={
                    mediaNodeWidthPx != null
                        ? { width: mediaNodeWidthPx }
                        : undefined
                }
            >
                <Handle
                    type="target"
                    position={Position.Left}
                    id="in:videoNode"
                    isConnectableStart={false}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    id="out:videoNode"
                    isConnectableStart={false}
                />
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
                            onClick={() => logger.debug("compose mode toggle")}
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
                    // Single-player layout akin to image node with resolution badge
                    <div
                        className="relative w-full nodrag"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        {videoError ? (
                            <ModalityPlaceholder modality="video" />
                        ) : singleVideoUrl ? (
                            <video
                                ref={singleVideoRef}
                                src={singleVideoUrl}
                                controls
                                controlsList="nodownload"
                                className="w-full h-auto object-contain"
                                preload="metadata"
                                onError={() => setVideoError(true)}
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
                        {videoDimensions && (
                            <div className="absolute bottom-2 right-2 text-xs text-white bg-black/50 px-2 py-1 rounded pointer-events-none">
                                {videoDimensions.width} ×{" "}
                                {videoDimensions.height}
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
                                // Overflow chip on thumbnail rail
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
                                        <VideoGridThumb
                                            url={url}
                                            loadingLabel={t("loading")}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </BaseNodeShell>

            {/* Full screen modals - rendered outside BaseNodeShell */}
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
