import { Handle, Position, useNodeId } from "@xyflow/react";
import { Download, Maximize2, Music, X } from "lucide-react";
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
import { ModalityPlaceholder } from "./modality-placeholder";

type AudioNodeRfProps = RfDataNodeProps<"audioNode">;

// Single-track preview modal
const FullScreenAudioModal = ({
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
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl w-11/12 h-5/6 max-h-screen flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {t("audioPreview")}
                    </h2>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onClose}
                        className="hover:bg-gray-100 dark:hover:bg-slate-800"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Audio Player with Scrollable Container */}
                <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-800 overflow-auto p-8">
                    {url ? (
                        <audio
                            src={url}
                            controls
                            className="w-full max-w-2xl"
                            autoPlay
                        >
                            Your browser does not support the audio tag.
                        </audio>
                    ) : (
                        <div className="text-gray-500 dark:text-gray-400">
                            Loading...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

// Multi-track grid modal
const FullScreenWaterfallAudioModal = ({
    audioKeys,
    onClose,
}: {
    audioKeys: string[];
    onClose: () => void;
}) => {
    const t = useTranslations("Workspace.nodes.modal");
    const [mounted, setMounted] = useState(false);
    const { urls } = useFileAsyncLoaderBatch(audioKeys, { priority: "normal" });

    useEffect(() => {
        setMounted(true);
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "unset";
        };
    }, []);

    if (!mounted) return null;

    const AudioThumbnail = memo(
        ({
            data: fileKey,
        }: {
            data: string;
            width?: number;
            index?: number;
        }) => {
            const url = urls.get(fileKey);

            return (
                <div className="relative aspect-square overflow-hidden rounded-md border border-gray-300 dark:border-gray-600 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 shadow-md hover:shadow-lg transition-shadow cursor-pointer">
                    {url && (
                        <audio
                            src={url}
                            className="hidden"
                            preload="metadata"
                        />
                    )}
                    <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center">
                        <Music className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                        <span className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                            {url ? "Audio" : "Loading..."}
                        </span>
                    </div>
                </div>
            );
        },
    );

    const content = (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl w-11/12 h-5/6 max-h-screen flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {t("audios", { count: audioKeys.length })}
                    </h2>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onClose}
                        className="hover:bg-gray-100 dark:hover:bg-slate-800"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Waterfall with Scrollable Container */}
                <div className="flex-1 bg-white dark:bg-slate-800 overflow-auto p-6">
                    <Waterfall
                        items={audioKeys.map((key) => ({ id: key, key }))}
                        render={({ data: { key } }) => (
                            <AudioThumbnail data={key} />
                        )}
                        columnWidth={200}
                        columnGutter={12}
                        rowGutter={12}
                        itemKey={(data) => data.id}
                        maxColumnCount={6}
                    />
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

const AudioNode = ({ selected, data }: AudioNodeRfProps) => {
    const t = useTranslations("Workspace.nodes.modal");
    const keys: string[] = data.fileKeys ?? [];
    const _id = useNodeId();
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isWaterfallFullScreen, setIsWaterfallFullScreen] = useState(false);
    const [audioError, setAudioError] = useState(false);

    // Refs for audio elements
    const singleAudioRef = useRef<HTMLAudioElement>(null);
    const thumbnailAudioRefs = useRef<(HTMLAudioElement | null)[]>([]);

    // Lazy-fetch one waveform asset
    const { url: singleAudioUrl } = useFileAsyncLoader(keys[0], {
        priority: "high",
    });

    // Hydrate playlists concurrently
    const { urls: batchUrls } = useFileAsyncLoaderBatch(keys.slice(0, 6), {
        priority: "normal",
    });

    // Determine if single or multiple
    const isSingle = keys.length === 1;
    const count = keys.length;

    // Reset the error state when the source asset changes.
    useEffect(() => {
        setAudioError(false);
    }, [singleAudioUrl]);

    const handleDownload = (url: string, fileKey: string) => {
        const ext = fileKey.includes(".") ? fileKey.split(".").pop() : "mp3";
        const filename = `audio.${ext}`;
        const downloadUrl = `${url}${url.includes("?") ? "&" : "?"}download=${filename}`;
        window.open(downloadUrl, "_blank");
    };

    return (
        <>
            <BaseNodeShell selected={selected} count={count}>
                <Handle
                    type="target"
                    position={Position.Left}
                    id="in:audioNode"
                    isConnectableStart={false}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    id="out:audioNode"
                    isConnectableStart={false}
                />
                <NodeHeader>
                    <NodeHeaderIcon>
                        <Music />
                    </NodeHeaderIcon>
                    <NodeHeaderTitle>
                        {isSingle ? t("audio") : t("audios", { count })}
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
                            {isSingle && singleAudioUrl && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() =>
                                            handleDownload(
                                                singleAudioUrl,
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
                    // Single audio display
                    <div
                        className="px-3 pb-3 nodrag"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        {audioError ? (
                            <ModalityPlaceholder modality="audio" />
                        ) : singleAudioUrl ? (
                            <audio
                                ref={singleAudioRef}
                                src={singleAudioUrl}
                                controls
                                controlsList="nodownload"
                                className="w-full"
                                preload="metadata"
                                onError={() => setAudioError(true)}
                                onMouseEnter={() =>
                                    singleAudioRef.current?.play()
                                }
                                onMouseLeave={() =>
                                    singleAudioRef.current?.pause()
                                }
                            >
                                Your browser does not support the audio tag.
                            </audio>
                        ) : (
                            <div className="w-full h-10 bg-gray-200 rounded flex items-center justify-center text-gray-500 text-sm">
                                {t("loading")}
                            </div>
                        )}
                    </div>
                ) : (
                    // Multiple audios with Grid layout
                    <div
                        className="w-full p-2 nodrag"
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <div className="grid grid-cols-3 gap-2">
                            {keys.slice(0, 6).map((key, index) => {
                                // Overflow +N badge on last visible audio tile
                                const isLastAndMore = index === 5 && count > 6;
                                const remainingCount = count - 6;
                                const url = batchUrls.get(key);

                                return isLastAndMore ? (
                                    <div
                                        key={`more-${key}`}
                                        className="relative aspect-square overflow-hidden rounded-md border border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-slate-700 shadow-sm flex items-center justify-center"
                                    >
                                        <div className="text-center">
                                            <div className="text-3xl font-bold text-gray-700 dark:text-gray-300">
                                                +{remainingCount}
                                            </div>
                                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                                {t("more")}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        key={key}
                                        className="relative aspect-square overflow-hidden rounded-md border border-gray-300 dark:border-gray-600 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 shadow-sm"
                                        onMouseEnter={() =>
                                            thumbnailAudioRefs.current[
                                                index
                                            ]?.play()
                                        }
                                        onMouseLeave={() =>
                                            thumbnailAudioRefs.current[
                                                index
                                            ]?.pause()
                                        }
                                    >
                                        {url && (
                                            <audio
                                                ref={(el) => {
                                                    thumbnailAudioRefs.current[
                                                        index
                                                    ] = el;
                                                }}
                                                src={url}
                                                className="hidden"
                                                preload="metadata"
                                            />
                                        )}
                                        <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center">
                                            <Music className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                                            <span className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                                                {url
                                                    ? `${t("audio")} ${index + 1}`
                                                    : t("loading")}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </BaseNodeShell>

            {/* Full screen modals - rendered outside BaseNodeShell */}
            {isFullScreen && isSingle && keys[0] && (
                <FullScreenAudioModal
                    fileKey={keys[0]}
                    onClose={() => setIsFullScreen(false)}
                />
            )}
            {isWaterfallFullScreen && !isSingle && (
                <FullScreenWaterfallAudioModal
                    audioKeys={keys}
                    onClose={() => setIsWaterfallFullScreen(false)}
                />
            )}
        </>
    );
};

// Custom comparison function to prevent unnecessary re-renders
const areEqual = (prevProps: AudioNodeRfProps, nextProps: AudioNodeRfProps) => {
    const prevFileKeys = prevProps.data.fileKeys || [];
    const nextFileKeys = nextProps.data.fileKeys || [];

    return (
        prevProps.selected === nextProps.selected &&
        JSON.stringify(prevFileKeys) === JSON.stringify(nextFileKeys)
    );
};

AudioNode.displayName = "AudioNode";

export default memo(AudioNode, areEqual);
