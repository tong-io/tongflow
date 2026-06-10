"use client";

import {
    Box,
    Download,
    File,
    FileText,
    FolderOpen,
    Heart,
    Image,
    Loader2,
    Music,
    RefreshCw,
    Star,
    Video,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { showErrorToast } from "@/components/ui/error-toast";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Waterfall } from "@/components/ui/waterfall";
import {
    listMaterials,
    type Material,
    type MaterialType,
    toggleFavorite,
} from "@/lib/api/material";
import { getFileUrl } from "@/lib/file/url";
import { logger } from "@/lib/logger";
import { formatDate } from "@/utils/date-utils";

const TYPE_ICONS: Record<MaterialType, React.ReactNode> = {
    image: <Image className="size-4" />,
    video: <Video className="size-4" />,
    audio: <Music className="size-4" />,
    text: <FileText className="size-4" />,
    file: <File className="size-4" />,
    model: <Box className="size-4" />,
};

function MaterialCard({
    data,
    onFavoriteToggle,
}: {
    index: number;
    data: Material;
    width: number;
    onFavoriteToggle?: (id: number, newStatus: boolean) => void;
}) {
    const t = useTranslations("portfolio");
    const typeIcon = TYPE_ICONS[data.type];
    const [isPlaying, setIsPlaying] = useState(false);
    const [isFavorite, setIsFavorite] = useState(data.isFavorite);
    const [isToggling, setIsToggling] = useState(false);
    const thumbnailVideoRef = useRef<HTMLVideoElement>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const isCover = data.isCover ?? false;

    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDownloading) return;

        const fileKey = data.content.fileKeys?.[0];
        if (!fileKey) {
            showErrorToast({ message: t("cannotDownload") });
            return;
        }

        setIsDownloading(true);
        try {
            const fileUrl = getFileUrl(fileKey);
            const response = await fetch(fileUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = data.name || fileKey.split("/").pop() || "download";
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success(t("downloadSuccess"));
        } catch (error) {
            logger.error("Download failed:", error);
            showErrorToast({ message: t("operationFailed") });
        } finally {
            setIsDownloading(false);
        }
    };

    const handleToggleFavorite = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isToggling) return;

        setIsToggling(true);
        try {
            const result = await toggleFavorite(data.id);
            setIsFavorite(result.isFavorite);
            onFavoriteToggle?.(data.id, result.isFavorite);
            toast.success(
                result.isFavorite ? t("favorited") : t("unfavorited"),
            );
        } catch (error) {
            logger.error("Failed to toggle favorite:", error);
            showErrorToast({ message: t("operationFailed") });
        } finally {
            setIsToggling(false);
        }
    };

    const renderPreview = () => {
        const { type, content, thumbnail } = data;
        const fileKey = content.fileKeys?.[0];
        const fileUrl = fileKey ? getFileUrl(fileKey) : "";
        const thumbnailUrl = thumbnail ? getFileUrl(thumbnail) : "";

        switch (type) {
            case "image":
                return (
                    <img
                        src={thumbnailUrl || fileUrl}
                        alt={data.name}
                        className="w-full h-auto object-cover rounded-t-lg"
                        loading="lazy"
                    />
                );

            case "video": {
                const isVideoThumbnail = thumbnailUrl
                    ? /\.(mp4|webm|mov)$/i.test(thumbnailUrl)
                    : false;

                return (
                    <div
                        className="relative group"
                        onMouseEnter={() => {
                            thumbnailVideoRef.current?.play().catch(() => {});
                        }}
                        onMouseLeave={() => {
                            thumbnailVideoRef.current?.pause();
                        }}
                    >
                        {isPlaying ? (
                            <video
                                src={fileUrl}
                                className="w-full h-auto rounded-t-lg"
                                controls
                                autoPlay
                                onEnded={() => setIsPlaying(false)}
                            />
                        ) : (
                            <>
                                {isVideoThumbnail ? (
                                    <video
                                        ref={thumbnailVideoRef}
                                        src={thumbnailUrl}
                                        className="w-full h-auto object-cover rounded-t-lg"
                                        muted
                                        loop
                                        playsInline
                                    />
                                ) : thumbnailUrl ? (
                                    <img
                                        src={thumbnailUrl}
                                        alt={data.name}
                                        className="w-full h-auto object-cover rounded-t-lg"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="w-full aspect-video bg-muted rounded-t-lg flex items-center justify-center">
                                        <Video className="size-12 text-muted-foreground" />
                                    </div>
                                )}
                                <button
                                    type="button"
                                    className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-100 group-hover:opacity-0 transition-opacity rounded-t-lg z-10"
                                    onClick={() => setIsPlaying(true)}
                                >
                                    <div className="size-12 rounded-full bg-white/90 flex items-center justify-center">
                                        <div className="ml-1 border-l-[16px] border-l-primary border-y-[10px] border-y-transparent" />
                                    </div>
                                </button>
                            </>
                        )}
                    </div>
                );
            }

            case "audio":
                return (
                    <div className="p-4 bg-muted rounded-t-lg">
                        <div className="flex items-center justify-center mb-3">
                            <Music className="size-12 text-primary" />
                        </div>
                        <audio src={fileUrl} controls className="w-full" />
                    </div>
                );

            case "text":
                return (
                    <div className="p-4 bg-muted rounded-t-lg">
                        <p className="text-sm text-muted-foreground line-clamp-6 whitespace-pre-wrap">
                            {content.texts?.[0] || t("noTextContent")}
                        </p>
                    </div>
                );

            case "model":
                return (
                    <div className="relative aspect-square bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-t-lg flex items-center justify-center">
                        {thumbnailUrl ? (
                            <img
                                src={thumbnailUrl}
                                alt={data.name}
                                className="w-full h-full object-cover rounded-t-lg"
                                loading="lazy"
                            />
                        ) : (
                            <Box className="size-16 text-primary" />
                        )}
                    </div>
                );
            default:
                return (
                    <div className="aspect-square bg-muted rounded-t-lg flex items-center justify-center">
                        <File className="size-16 text-muted-foreground" />
                    </div>
                );
        }
    };

    if (data.type === "image") {
        return (
            <div className="relative rounded-lg overflow-hidden group">
                {renderPreview()}

                <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
                    <div className="flex items-center gap-1">
                        {isCover && (
                            <div className="flex items-center gap-1 bg-amber-500/90 text-white px-2 py-1 rounded text-xs">
                                <Star className="size-3 fill-current" />
                                {t("featured")}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={isDownloading}
                            className={`p-1.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm transition-colors ${
                                isDownloading
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                            }`}
                            title={t("download")}
                        >
                            {isDownloading ? (
                                <Loader2 className="size-4 text-white animate-spin" />
                            ) : (
                                <Download className="size-4 text-white" />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={handleToggleFavorite}
                            disabled={isToggling}
                            className={`p-1.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm transition-colors ${
                                isToggling
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                            }`}
                            title={isFavorite ? t("unfavorite") : t("favorite")}
                        >
                            <Heart
                                className={`size-4 transition-colors ${
                                    isFavorite
                                        ? "fill-red-500 text-red-500"
                                        : "text-white hover:text-red-500"
                                }`}
                            />
                        </button>
                    </div>
                </div>

                <div className="absolute bottom-2 left-2">
                    <div className="flex items-center gap-1 bg-black/50 text-white px-2 py-1 rounded text-xs">
                        <Image className="size-3" />
                        {t("image")}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-card border rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden group relative">
            {renderPreview()}

            <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
                <div className="flex items-center gap-1">
                    {isCover && (
                        <div className="flex items-center gap-1 bg-amber-500/90 text-white px-2 py-1 rounded text-xs">
                            <Star className="size-3 fill-current" />
                            {t("featured")}
                        </div>
                    )}
                </div>
            </div>

            <div className="p-3">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                            {typeIcon}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {t(data.type)}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={isDownloading}
                            className={`p-1 rounded-full hover:bg-muted transition-colors ${
                                isDownloading
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                            }`}
                            title={t("download")}
                        >
                            {isDownloading ? (
                                <Loader2 className="size-4 text-muted-foreground animate-spin" />
                            ) : (
                                <Download className="size-4 text-muted-foreground hover:text-primary" />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={handleToggleFavorite}
                            disabled={isToggling}
                            className={`p-1 rounded-full hover:bg-muted transition-colors ${
                                isToggling
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                            }`}
                            title={isFavorite ? t("unfavorite") : t("favorite")}
                        >
                            <Heart
                                className={`size-4 transition-colors ${
                                    isFavorite
                                        ? "fill-red-500 text-red-500"
                                        : "text-muted-foreground hover:text-red-500"
                                }`}
                            />
                        </button>
                    </div>
                </div>
                <h3 className="font-medium text-sm truncate" title={data.name}>
                    {data.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(data.createdAt)}
                </p>
            </div>
        </div>
    );
}

function FilterButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
        >
            {children}
        </button>
    );
}

interface PortfolioDialogProps {
    trigger?: React.ReactNode;
    /** Optional tooltip shown when hovering the (custom) trigger. */
    tooltip?: string;
}

export function PortfolioDialog({ trigger, tooltip }: PortfolioDialogProps) {
    const t = useTranslations("portfolio");
    const [open, setOpen] = useState(false);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<MaterialType | "all">("all");
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

    const fetchMaterials = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await listMaterials(
                filter === "all" ? undefined : filter,
            );
            setMaterials(response.materials);
        } catch (err) {
            setError(t("fetchFailed"));
            logger.error("Failed to fetch materials:", err);
        } finally {
            setLoading(false);
        }
    }, [filter, t]);

    useEffect(() => {
        if (open) {
            fetchMaterials();
        }
    }, [open, fetchMaterials]);

    const handleFavoriteToggle = useCallback(
        (id: number, newStatus: boolean) => {
            setMaterials((prev) =>
                prev.map((m) =>
                    m.id === id ? { ...m, isFavorite: newStatus } : m,
                ),
            );
        },
        [],
    );

    const filteredMaterials = materials.filter((m) => {
        if (!m) return false;
        const typeMatch = filter === "all" || m.type === filter;
        const favoriteMatch = !showFavoritesOnly || m.isFavorite;
        return typeMatch && favoriteMatch;
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger ? (
                tooltip ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DialogTrigger asChild>{trigger}</DialogTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{tooltip}</TooltipContent>
                    </Tooltip>
                ) : (
                    <DialogTrigger asChild>{trigger}</DialogTrigger>
                )
            ) : (
                <DialogTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                        <FolderOpen className="h-4 w-4" />
                    </Button>
                </DialogTrigger>
            )}
            <DialogContent
                className="!max-w-[95vw] !w-[95vw] h-[85vh] flex flex-col p-0"
                aria-describedby={undefined}
            >
                <div className="flex items-center gap-4 px-4 py-3 border-b shrink-0">
                    <DialogTitle className="text-lg shrink-0">
                        {t("title")}
                    </DialogTitle>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={fetchMaterials}
                        disabled={loading}
                        className="shrink-0 size-8"
                    >
                        <RefreshCw
                            className={`size-4 ${loading ? "animate-spin" : ""}`}
                        />
                    </Button>
                    <div className="flex items-center gap-1.5">
                        <FilterButton
                            active={filter === "all"}
                            onClick={() => setFilter("all")}
                        >
                            {t("all")}
                        </FilterButton>
                        {(Object.keys(TYPE_ICONS) as MaterialType[]).map(
                            (type) => (
                                <FilterButton
                                    key={type}
                                    active={filter === type}
                                    onClick={() => setFilter(type)}
                                >
                                    <span className="flex items-center gap-1">
                                        {TYPE_ICONS[type]}
                                        {t(type)}
                                    </span>
                                </FilterButton>
                            ),
                        )}
                        <div className="w-px h-5 bg-border mx-1" />
                        <FilterButton
                            active={showFavoritesOnly}
                            onClick={() =>
                                setShowFavoritesOnly(!showFavoritesOnly)
                            }
                        >
                            <span className="flex items-center gap-1">
                                <Heart
                                    className={`size-3.5 ${
                                        showFavoritesOnly ? "fill-current" : ""
                                    }`}
                                />
                                {t("favorited")}
                            </span>
                        </FilterButton>
                    </div>
                </div>

                <div className="flex-1 overflow-auto px-6 py-4">
                    {loading ? (
                        <div className="h-full flex items-center justify-center">
                            <Loader2 className="size-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : error ? (
                        <div className="h-full flex flex-col items-center justify-center gap-4">
                            <p className="text-destructive">{error}</p>
                            <Button variant="outline" onClick={fetchMaterials}>
                                {t("retry")}
                            </Button>
                        </div>
                    ) : filteredMaterials.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center gap-2">
                            <FolderOpen className="size-16 text-muted-foreground" />
                            <p className="text-muted-foreground">
                                {t("noWorks")}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {t("worksWillShow")}
                            </p>
                        </div>
                    ) : (
                        <Waterfall
                            key={`${filter}-${showFavoritesOnly}`}
                            items={filteredMaterials}
                            render={(props) => (
                                <MaterialCard
                                    {...props}
                                    onFavoriteToggle={handleFavoriteToggle}
                                />
                            )}
                            columnWidth={280}
                            columnGutter={16}
                            rowGutter={16}
                            itemKey={(item, index) => item?.id ?? index}
                            className="min-h-full"
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
