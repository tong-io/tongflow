"use client";

import { formatDate } from "@/utils/date-utils";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Waterfall } from "@/components/ui/waterfall";
import {
    listMaterials,
    toggleFavorite,
    toggleShare,
    traceMaterialWorkflow,
    shareFromMaterial,
    type Material,
    type MaterialType,
} from "@/lib/api/material";
import { getR2Url } from "@/lib/r2-utils";
import {
    FolderOpen,
    Image,
    Video,
    Music,
    FileText,
    File,
    Box,
    Loader2,
    RefreshCw,
    Heart,
    Upload,
    Star,
    X,
    Download,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

// 素材类型图标
const TYPE_ICONS: Record<MaterialType, React.ReactNode> = {
    image: <Image className="size-4" />,
    video: <Video className="size-4" />,
    audio: <Music className="size-4" />,
    text: <FileText className="size-4" />,
    file: <File className="size-4" />,
    model: <Box className="size-4" />,
};

// 素材卡片组件
function MaterialCard({
    data,
    onFavoriteToggle,
    onShare,
    onShareToggle,
}: {
    index: number;
    data: Material;
    width: number;
    onFavoriteToggle?: (id: number, newStatus: boolean) => void;
    onShare?: (material: Material) => void;
    onShareToggle?: (id: number, newStatus: boolean) => void;
}) {
    const t = useTranslations("portfolio");
    const typeIcon = TYPE_ICONS[data.type];
    const [isPlaying, setIsPlaying] = useState(false);
    const [isFavorite, setIsFavorite] = useState(data.isFavorite);
    const [isShared, setIsShared] = useState(data.isShared);
    const [isToggling, setIsToggling] = useState(false);
    const [isTogglingShare, setIsTogglingShare] = useState(false);
    const thumbnailVideoRef = useRef<HTMLVideoElement>(null);
    const [isDownloading, setIsDownloading] = useState(false);

    // 下载文件
    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDownloading) return;

        const fileKey = data.content.fileKeys?.[0];
        if (!fileKey) {
            toast.error(t("cannotDownload"));
            return;
        }

        setIsDownloading(true);
        try {
            const fileUrl = getR2Url(fileKey);
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
            console.error("Download failed:", error);
            toast.error(t("operationFailed"));
        } finally {
            setIsDownloading(false);
        }
    };

    // 是否可分享（只有图片和视频可以作为代表作分享）
    const canShare = data.type === "image" || data.type === "video";
    // 是否为代表作
    const isCover = data.isCover ?? false;
    // 是否可以取消分享（代表作不能取消分享）
    const canUnshare = isShared && !isCover;

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
            console.error("Failed to toggle favorite:", error);
            toast.error(t("operationFailed"));
        } finally {
            setIsToggling(false);
        }
    };

    const handleToggleShare = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isTogglingShare) return;

        // 如果是代表作且已分享，不允许取消分享
        if (isCover && isShared) {
            toast.error(t("cannotUnshareFeatured"));
            return;
        }

        setIsTogglingShare(true);
        try {
            // 如果当前未分享，需要先追溯工作流判断来源
            if (!isShared) {
                const traceResult = await traceMaterialWorkflow(data.id);

                // 如果是来自私有工作流（未发布的工作流）
                if (traceResult.workflow && !traceResult.workflow.isPublished) {
                    // 需要弹出对话框发布工作流
                    setIsTogglingShare(false);
                    onShare?.(data);
                    return;
                }

                // 如果来自已发布的工作流或分享的工作流，直接切换状态
                // 允许分享来自他人工作流的作品 (只是展示作品，不发布工作流)
                if (traceResult.share) {
                    const result = await toggleShare(data.id);
                    setIsShared(result.isShared);
                    onShareToggle?.(data.id, result.isShared);
                    toast.success(
                        result.isShared ? t("publicShared") : t("privateDone"),
                    );
                    setIsTogglingShare(false);
                    return;
                }
            }

            // 已发布工作流产出的作品或取消分享操作，直接切换状态
            const result = await toggleShare(data.id);
            setIsShared(result.isShared);
            onShareToggle?.(data.id, result.isShared);
            toast.success(
                result.isShared ? t("publicShared") : t("privateDone"),
            );
        } catch (error: any) {
            console.error("Failed to toggle share:", error);
            if (error?.code === "CANNOT_UNSHARE_COVER") {
                toast.error(t("cannotUnshareFeatured"));
            } else if (error?.code === "CANNOT_RESHARE") {
                toast.error(t("cannotReshare"));
            } else {
                toast.error(t("operationFailed"));
            }
        } finally {
            setIsTogglingShare(false);
        }
    };

    // 渲染预览内容
    const renderPreview = () => {
        const { type, content, thumbnail } = data;
        const fileKey = content.fileKeys?.[0];
        const fileUrl = fileKey ? getR2Url(fileKey) : "";
        const thumbnailUrl = thumbnail ? getR2Url(thumbnail) : "";

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

            case "video":
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

            case "file":
            default:
                return (
                    <div className="aspect-square bg-muted rounded-t-lg flex items-center justify-center">
                        <File className="size-16 text-muted-foreground" />
                    </div>
                );
        }
    };

    // 只有图片类型才用简化卡片
    if (data.type === "image") {
        return (
            <div className="relative rounded-lg overflow-hidden group">
                {renderPreview()}

                {/* 顶部工具栏 - 标签和按钮一排 */}
                <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
                    {/* 左侧标签 */}
                    <div className="flex items-center gap-1">
                        {isCover && (
                            <div className="flex items-center gap-1 bg-amber-500/90 text-white px-2 py-1 rounded text-xs">
                                <Star className="size-3 fill-current" />
                                {t("featured")}
                            </div>
                        )}
                        {isShared && (
                            <div className="flex items-center gap-1 bg-green-500/90 text-white px-2 py-1 rounded text-xs">
                                <Upload className="size-3" />
                                {t("shared")}
                            </div>
                        )}
                    </div>
                    {/* 右侧按钮 */}
                    <div className="flex items-center gap-1">
                        {/* 下载按钮 */}
                        <button
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
                        {/* 分享/取消分享按钮 */}
                        {canShare && (
                            <button
                                onClick={handleToggleShare}
                                disabled={
                                    isTogglingShare || (isCover && isShared)
                                }
                                className={`p-1.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm transition-colors ${
                                    isTogglingShare || (isCover && isShared)
                                        ? "opacity-50 cursor-not-allowed"
                                        : ""
                                }`}
                                title={
                                    isCover && isShared
                                        ? "代表作不能取消分享"
                                        : isShared
                                          ? "取消分享"
                                          : "分享"
                                }
                            >
                                {isShared ? (
                                    <X className="size-4 text-white" />
                                ) : (
                                    <Upload className="size-4 text-white" />
                                )}
                            </button>
                        )}
                        {/* 收藏按钮 */}
                        <button
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

                {/* 底部类型标签 */}
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

            {/* 顶部工具栏 - 标签和按钮一排 */}
            <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
                {/* 左侧标签 */}
                <div className="flex items-center gap-1">
                    {isCover && (
                        <div className="flex items-center gap-1 bg-amber-500/90 text-white px-2 py-1 rounded text-xs">
                            <Star className="size-3 fill-current" />
                            {t("featured")}
                        </div>
                    )}
                    {isShared && (
                        <div className="flex items-center gap-1 bg-green-500/90 text-white px-2 py-1 rounded text-xs">
                            <Upload className="size-3" />
                            {t("shared")}
                        </div>
                    )}
                </div>
                {/* 右侧按钮 */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* 分享/取消分享按钮 */}
                    {canShare && (
                        <button
                            onClick={handleToggleShare}
                            disabled={isTogglingShare || (isCover && isShared)}
                            className={`p-1.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm transition-colors ${
                                isTogglingShare || (isCover && isShared)
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                            }`}
                            title={
                                isCover && isShared
                                    ? t("cannotUnshareFeatured")
                                    : isShared
                                      ? t("unshare")
                                      : t("share")
                            }
                        >
                            {isShared ? (
                                <X className="size-4 text-white" />
                            ) : (
                                <Upload className="size-4 text-white" />
                            )}
                        </button>
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
                        {/* 下载按钮 */}
                        <button
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
                        {/* 分享/取消分享按钮 */}
                        {canShare && (
                            <button
                                onClick={handleToggleShare}
                                disabled={
                                    isTogglingShare || (isCover && isShared)
                                }
                                className={`p-1 rounded-full hover:bg-muted transition-colors ${
                                    isTogglingShare || (isCover && isShared)
                                        ? "opacity-50 cursor-not-allowed"
                                        : ""
                                }`}
                                title={
                                    isCover && isShared
                                        ? t("cannotUnshareFeatured")
                                        : isShared
                                          ? t("unshare")
                                          : t("share")
                                }
                            >
                                {isShared ? (
                                    <X
                                        className={`size-4 transition-colors ${
                                            isCover
                                                ? "text-muted-foreground"
                                                : "text-red-500 hover:text-red-600"
                                        }`}
                                    />
                                ) : (
                                    <Upload className="size-4 transition-colors text-muted-foreground hover:text-green-500" />
                                )}
                            </button>
                        )}
                        <button
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

// 筛选按钮组件
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
}

export function PortfolioDialog({ trigger }: PortfolioDialogProps) {
    const t = useTranslations("portfolio");
    const [open, setOpen] = useState(false);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<MaterialType | "all">("all");
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

    // 分享相关状态
    const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
    const [sharingMaterial, setSharingMaterial] = useState<Material | null>(
        null,
    );
    const [shareDescription, setShareDescription] = useState("");
    const [sharing, setSharing] = useState(false);
    const [tracing, setTracing] = useState(false);
    const [tracedWorkflow, setTracedWorkflow] = useState<{
        id: number;
        name: string;
        isPublished: boolean;
    } | null>(null);

    // 获取素材列表
    const fetchMaterials = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await listMaterials(
                filter === "all" ? undefined : filter,
            );
            setMaterials(response.materials);
        } catch (err) {
            setError("获取作品集失败，请重试");
            console.error("Failed to fetch materials:", err);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    // 当对话框打开时获取数据
    useEffect(() => {
        if (open) {
            fetchMaterials();
        }
    }, [open, fetchMaterials]);

    // 处理收藏状态变化
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

    // 处理分享状态变化
    const handleShareToggle = useCallback((id: number, newStatus: boolean) => {
        setMaterials((prev) =>
            prev.map((m) => (m.id === id ? { ...m, isShared: newStatus } : m)),
        );
    }, []);

    // 打开分享对话框并追溯工作流
    const openShareDialog = useCallback(async (material: Material) => {
        setSharingMaterial(material);
        setShareDescription("");
        setTracedWorkflow(null);
        setIsShareDialogOpen(true);

        // 追溯工作流
        setTracing(true);
        try {
            const result = await traceMaterialWorkflow(material.id);
            if (result.workflow) {
                setTracedWorkflow({
                    id: result.workflow.id,
                    name: result.workflow.name,
                    isPublished: result.workflow.isPublished,
                });
                setShareDescription(result.workflow.description || "");
            } else if (result.share) {
                // 来自别人分享的工作流，直接切换分享状态
                // 关闭分享对话框，因为不需要发布流程
                setIsShareDialogOpen(false);
                const toggleResult = await toggleShare(material.id);
                handleShareToggle(material.id, toggleResult.isShared);
                toast.success(
                    toggleResult.isShared ? "已公开分享" : "已取消公开",
                );
            } else {
                toast.error(result.message || "无法追溯到关联的工作流");
                setIsShareDialogOpen(false);
            }
        } catch (error) {
            console.error("追溯工作流失败:", error);
            toast.error("追溯工作流失败");
            setIsShareDialogOpen(false);
        } finally {
            setTracing(false);
        }
    }, []);

    // 执行分享
    const handleShare = async () => {
        if (!sharingMaterial || !tracedWorkflow) return;

        if (!shareDescription.trim()) {
            toast.error("请输入分享描述");
            return;
        }

        setSharing(true);
        try {
            const result = await shareFromMaterial(sharingMaterial.id, {
                description: shareDescription,
            });

            toast.success(result.isUpdate ? "更新发布成功！" : "发布成功！");
            setIsShareDialogOpen(false);
            setSharingMaterial(null);
            setShareDescription("");
            setTracedWorkflow(null);
        } catch (error: any) {
            console.error("分享失败:", error);
            if (error?.code === "CANNOT_RESHARE") {
                toast.error("此作品来自他人分享的工作流，无法再次分享");
            } else {
                toast.error("分享失败，请重试");
            }
        } finally {
            setSharing(false);
        }
    };

    // 筛选后的素材
    const filteredMaterials = materials.filter((m) => {
        if (!m) return false;
        const typeMatch = filter === "all" || m.type === filter;
        const favoriteMatch = !showFavoritesOnly || m.isFavorite;
        return typeMatch && favoriteMatch;
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger ? (
                <DialogTrigger asChild>{trigger}</DialogTrigger>
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
                    {/* 筛选标签 */}
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
                                    onShare={openShareDialog}
                                    onShareToggle={handleShareToggle}
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

            {/* 分享对话框 */}
            <Dialog
                open={isShareDialogOpen}
                onOpenChange={(open) => {
                    setIsShareDialogOpen(open);
                    if (!open) {
                        setSharingMaterial(null);
                        setShareDescription("");
                        setTracedWorkflow(null);
                    }
                }}
            >
                <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>
                            {tracedWorkflow?.isPublished
                                ? "更新发布"
                                : "分享作品"}
                        </DialogTitle>
                    </DialogHeader>

                    {tracing ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-muted-foreground">
                                正在追溯工作流...
                            </span>
                        </div>
                    ) : tracedWorkflow ? (
                        <div className="space-y-4 py-4">
                            {/* 作品预览 */}
                            {sharingMaterial && (
                                <div className="space-y-2">
                                    <Label>作品代表作</Label>
                                    <div className="w-32 h-32 rounded-lg overflow-hidden border">
                                        <img
                                            src={getR2Url(
                                                sharingMaterial.thumbnail ||
                                                    sharingMaterial.content
                                                        .fileKeys?.[0] ||
                                                    "",
                                            )}
                                            alt={sharingMaterial.name}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* 关联的工作流信息 */}
                            <div className="space-y-2">
                                <Label>关联工作流</Label>
                                <div className="p-3 bg-muted rounded-lg">
                                    <p className="font-medium">
                                        {tracedWorkflow.name}
                                    </p>
                                    {tracedWorkflow.isPublished && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            此工作流已发布，将更新现有版本
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* 分享描述 */}
                            <div className="space-y-2">
                                <Label htmlFor="share-description">
                                    发布描述
                                </Label>
                                <Textarea
                                    id="share-description"
                                    value={shareDescription}
                                    onChange={(e) =>
                                        setShareDescription(e.target.value)
                                    }
                                    placeholder="请输入发布描述，让其他用户了解这个工作流能做什么..."
                                    rows={3}
                                />
                            </div>
                        </div>
                    ) : null}

                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">取消</Button>
                        </DialogClose>
                        <Button
                            onClick={handleShare}
                            disabled={sharing || tracing || !tracedWorkflow}
                        >
                            {sharing ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    发布中...
                                </>
                            ) : (
                                <>
                                    <Upload className="mr-2 h-4 w-4" />
                                    {tracedWorkflow?.isPublished
                                        ? "更新"
                                        : "发布"}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Dialog>
    );
}
