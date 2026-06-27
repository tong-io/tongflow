import { Handle, Position } from "@xyflow/react";
import { Image as ImageIcon, Maximize2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenuLabel } from "@/components/ui/dropdown-menu";
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

type ImageNodeRfProps = RfDataNodeProps<"imageNode">;

// Single-image lightbox modal
const FullScreenImageModal = ({
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
                        {t("imagePreview")}
                    </h2>
                    <Button size="sm" variant="ghost" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Image with Scrollable Container */}
                <div className="flex-1 overflow-auto bg-white flex items-center justify-center">
                    {url ? (
                        <img
                            src={url}
                            alt={t("fullScreenPreview")}
                            className="max-w-full max-h-full object-contain"
                        />
                    ) : (
                        <div className="text-gray-500">{t("loading")}</div>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

// Multi-image masonry lightbox
const FullScreenWaterfallImageModal = ({
    imageKeys,
    onClose,
}: {
    imageKeys: string[];
    onClose: () => void;
}) => {
    const t = useTranslations("Workspace.nodes.modal");
    const [mounted, setMounted] = useState(false);
    const { urls } = useFileAsyncLoaderBatch(imageKeys, { priority: "normal" });

    useEffect(() => {
        setMounted(true);
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "unset";
        };
    }, []);

    if (!mounted) return null;

    const ImageThumbnail = memo(
        ({
            data: fileKey,
        }: {
            data: string;
            width?: number;
            index?: number;
        }) => {
            const url = urls.get(fileKey);

            return (
                <div className="relative overflow-hidden rounded-md border border-gray-300 bg-gray-200 shadow-md hover:shadow-lg transition-shadow cursor-pointer w-full h-full">
                    {url ? (
                        <img
                            src={url}
                            alt={t("image")}
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full w-full bg-gray-300">
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
                        {t("images", { count: imageKeys.length })}
                    </h2>
                    <Button size="sm" variant="ghost" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Waterfall with Scrollable Container */}
                <div className="flex-1 bg-white overflow-auto p-6">
                    <Waterfall
                        items={imageKeys.map((key) => ({ id: key, key }))}
                        render={({ data: { key } }) => (
                            <ImageThumbnail data={key} />
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

// Grid thumbnail that falls back to a neutral placeholder on load failure.
const ImageGridThumb = ({
    url,
    index,
    loadingLabel,
}: {
    url: string | undefined;
    index: number;
    loadingLabel: string;
}) => {
    const [errored, setErrored] = useState(false);

    if (url && !errored) {
        return (
            <img
                src={url}
                alt={`Image ${index + 1}`}
                className="h-full w-full object-cover"
                onError={() => setErrored(true)}
            />
        );
    }

    if (errored) {
        return <ModalityPlaceholder modality="image" variant="thumb" />;
    }

    return (
        <div className="h-full w-full flex items-center justify-center bg-gray-300">
            <div className="text-xs text-gray-500">{loadingLabel}</div>
        </div>
    );
};

const ImageNode = ({ selected, data }: ImageNodeRfProps) => {
    const t = useTranslations("Workspace.nodes.modal");
    const keys: string[] = data.fileKeys ?? [];
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isWaterfallFullScreen, setIsWaterfallFullScreen] = useState(false);
    const [imageDimensions, setImageDimensions] = useState<{
        width: number;
        height: number;
    } | null>(null);
    const [imageError, setImageError] = useState(false);

    // Lazy-load one asset via async hook
    const { url: singleImageUrl } = useFileAsyncLoader(keys[0], {
        priority: "high",
    });

    // Batch lazy-load multiple assets
    const { urls: batchUrls } = useFileAsyncLoaderBatch(keys.slice(0, 6), {
        priority: "normal",
    });

    // Resolve intrinsic dimensions for one image
    useEffect(() => {
        if (!singleImageUrl) {
            setImageDimensions(null);
            setImageError(false);
            return;
        }

        setImageError(false);
        const img = new Image();
        img.onload = () => {
            setImageDimensions({
                width: img.naturalWidth,
                height: img.naturalHeight,
            });
        };
        img.onerror = () => {
            setImageDimensions(null);
            setImageError(true);
        };
        img.src = singleImageUrl;
    }, [singleImageUrl]);

    // Determine if single or multiple
    const isSingle = keys.length === 1;
    const count = keys.length;

    const mediaNodeWidthPx =
        isSingle && imageDimensions
            ? proportionalMediaNodeWidthPx(
                  imageDimensions.width,
                  imageDimensions.height,
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
                    id="in:imageNode"
                    isConnectableStart={false}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    id="out:imageNode"
                    isConnectableStart={false}
                />
                <NodeHeader>
                    <NodeHeaderIcon>
                        <ImageIcon />
                    </NodeHeaderIcon>
                    <NodeHeaderTitle>
                        {isSingle ? t("image") : t("images", { count })}
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
                        </NodeHeaderMenuAction>
                    </NodeHeaderActions>
                </NodeHeader>

                {/* Content */}
                {isSingle ? (
                    // Single image display
                    <div className="relative w-full">
                        {imageError ? (
                            <ModalityPlaceholder modality="image" />
                        ) : singleImageUrl ? (
                            <img
                                src={singleImageUrl}
                                alt="Image content"
                                className="w-full h-auto object-contain"
                                onError={() => setImageError(true)}
                            />
                        ) : (
                            <div className="w-full bg-gray-200 flex items-center justify-center text-gray-500 py-16">
                                {t("loading")}
                            </div>
                        )}
                        {imageDimensions && (
                            <div className="absolute bottom-2 right-2 text-xs text-white bg-black/50 px-2 py-1 rounded">
                                {imageDimensions.width} ×{" "}
                                {imageDimensions.height}
                            </div>
                        )}
                    </div>
                ) : (
                    // Multiple images with Grid layout
                    <div className="w-full p-2">
                        <div className="grid grid-cols-3 gap-2">
                            {keys.slice(0, 6).map((key, index) => {
                                // Overlay +N chip on final thumb when overflow
                                const isLastAndMore = index === 5 && count > 6;
                                const remainingCount = count - 6;
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
                                    >
                                        <ImageGridThumb
                                            url={url}
                                            index={index}
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
                <FullScreenImageModal
                    fileKey={keys[0]}
                    onClose={() => setIsFullScreen(false)}
                />
            )}
            {isWaterfallFullScreen && !isSingle && (
                <FullScreenWaterfallImageModal
                    imageKeys={keys}
                    onClose={() => setIsWaterfallFullScreen(false)}
                />
            )}
        </>
    );
};

// Custom comparison function to prevent unnecessary re-renders
const areEqual = (prevProps: ImageNodeRfProps, nextProps: ImageNodeRfProps) => {
    const prevFileKeys = prevProps.data.fileKeys || [];
    const nextFileKeys = nextProps.data.fileKeys || [];

    return (
        prevProps.selected === nextProps.selected &&
        JSON.stringify(prevFileKeys) === JSON.stringify(nextFileKeys)
    );
};

ImageNode.displayName = "ImageNode";

export default memo(ImageNode, areEqual);
