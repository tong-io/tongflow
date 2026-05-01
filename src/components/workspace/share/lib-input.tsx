import { useState, useEffect, useCallback, memo } from "react";
import { useNodeId } from "@xyflow/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
    Image as ImageIcon,
    Video,
    Music,
    FileText,
    Box,
    File,
    Trash2,
    RefreshCw,
} from "lucide-react";
import useFlow from "@/hooks/use-flow";
import {
    listMaterials,
    deleteMaterial,
    type Material,
    type MaterialType,
} from "@/lib/api/material";
import { useFileAsyncLoaderBatch } from "@/hooks/use-file-async-loader";
import toast from "react-hot-toast";
import { logger } from "@/lib/logger";

interface LibInputProps {
    resourceType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE" | "MODEL";
}

// Map frontend types to backend types
const resourceTypeToMaterialType: Record<string, MaterialType> = {
    TEXT: "text",
    IMAGE: "image",
    VIDEO: "video",
    AUDIO: "audio",
    FILE: "file",
    MODEL: "model",
};

// Map material types to node types
const materialTypeToNodeType: Record<MaterialType, string> = {
    image: "imageNode",
    video: "videoNode",
    audio: "audioNode",
    text: "textNode",
    file: "fileNode",
    model: "modelNode",
};

// Icons corresponding to each material type
const MaterialTypeIcon: Record<MaterialType, React.ReactNode> = {
    image: <ImageIcon className="h-6 w-6" />,
    video: <Video className="h-6 w-6" />,
    audio: <Music className="h-6 w-6" />,
    text: <FileText className="h-6 w-6" />,
    file: <File className="h-6 w-6" />,
    model: <Box className="h-6 w-6" />,
};

// Individual material item component
const MaterialItem = memo(
    ({
        material,
        thumbnailUrl,
        isLoading,
        onSelect,
        onDelete,
    }: {
        material: Material;
        thumbnailUrl?: string;
        isLoading?: boolean;
        onSelect: (material: Material) => void;
        onDelete: (id: number) => void;
    }) => {
        const [isDeleting, setIsDeleting] = useState(false);

        const handleDelete = async (e: React.MouseEvent) => {
            e.stopPropagation();
            if (isDeleting) return;

            setIsDeleting(true);
            try {
                await deleteMaterial(material.id);
                onDelete(material.id);
                toast.success("素材已删除");
            } catch (error) {
                logger.error("Failed to delete material:", error);
                toast.error("删除失败");
            } finally {
                setIsDeleting(false);
            }
        };

        const renderThumbnail = () => {
            if (material.type === "text") {
                const texts = material.content.texts || [];
                const previewText = texts[0]?.substring(0, 60) || "空文本";
                return (
                    <div className="h-full w-full p-2 text-xs text-muted-foreground overflow-hidden">
                        {previewText}
                        {previewText.length >= 60 && "..."}
                    </div>
                );
            }

            if (isLoading) {
                return (
                    <div className="h-full w-full flex items-center justify-center">
                        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                );
            }

            if (
                thumbnailUrl &&
                (material.type === "image" || material.type === "video")
            ) {
                return (
                    <img
                        src={thumbnailUrl}
                        alt={material.name}
                        className="h-full w-full object-cover"
                    />
                );
            }

            // Fallback: show the type icon
            return (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                    {MaterialTypeIcon[material.type]}
                </div>
            );
        };

        return (
            <div
                className={cn(
                    "relative aspect-square rounded-lg border border-border bg-card overflow-hidden cursor-pointer group",
                    "hover:border-primary hover:shadow-md transition-all",
                )}
                onClick={() => onSelect(material)}
            >
                {renderThumbnail()}

                {/* Delete button */}
                <Button
                    size="icon"
                    variant="destructive"
                    className={cn(
                        "absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
                        isDeleting && "opacity-100",
                    )}
                    onClick={handleDelete}
                    disabled={isDeleting}
                >
                    {isDeleting ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                        <Trash2 className="h-3 w-3" />
                    )}
                </Button>

                {/* Name label */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="text-xs text-white truncate">
                        {material.name}
                    </p>
                </div>
            </div>
        );
    },
);

MaterialItem.displayName = "MaterialItem";

export const LibInput = ({ resourceType }: LibInputProps) => {
    const expands = useFlow((s) => s.expands);
    const id = useNodeId();
    const [materials, setMaterials] = useState<Material[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const materialType = resourceTypeToMaterialType[resourceType];

    // Collect all thumbnail keys that need to be loaded
    const thumbnailKeys = materials
        .filter(
            (m) => m.thumbnail && (m.type === "image" || m.type === "video"),
        )
        .map((m) => m.thumbnail as string);

    const { urls: thumbnailUrls, isLoading: thumbnailsLoading } =
        useFileAsyncLoaderBatch(thumbnailKeys, { priority: "normal" });

    // Load the material list
    const loadMaterials = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await listMaterials(materialType);
            setMaterials(response.materials);
        } catch (err) {
            logger.error("Failed to load materials:", err);
            setError("加载素材失败");
        } finally {
            setIsLoading(false);
        }
    }, [materialType]);

    useEffect(() => {
        loadMaterials();
    }, [loadMaterials]);

    // Select a material
    const handleSelect = useCallback(
        (material: Material) => {
            if (!id) return;

            const nodeType = materialTypeToNodeType[material.type];
            const nodeData =
                material.type === "text"
                    ? { texts: material.content.texts }
                    : { fileKeys: material.content.fileKeys };

            expands(id, [{ type: nodeType, data: nodeData }]);
            toast.success("已添加素材");
        },
        [id, expands],
    );

    // Update the list after deleting a material
    const handleDelete = useCallback((deletedId: number) => {
        setMaterials((prev) => prev.filter((m) => m.id !== deletedId));
    }, []);

    if (isLoading) {
        return (
            <Card className="p-3">
                <div className="grid grid-cols-3 gap-2">
                    {[...Array(6)].map((_, i) => (
                        <Skeleton
                            key={i}
                            className="aspect-square rounded-lg"
                        />
                    ))}
                </div>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="p-3">
                <div className="text-center space-y-2">
                    <p className="text-sm text-destructive">{error}</p>
                    <Button size="sm" variant="outline" onClick={loadMaterials}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        重试
                    </Button>
                </div>
            </Card>
        );
    }

    if (materials.length === 0) {
        return (
            <Card className="p-6">
                <div className="text-center space-y-2">
                    <div className="flex justify-center text-muted-foreground">
                        {MaterialTypeIcon[materialType]}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        暂无
                        {resourceType === "IMAGE"
                            ? "图片"
                            : resourceType === "VIDEO"
                              ? "视频"
                              : resourceType === "AUDIO"
                                ? "音频"
                                : resourceType === "TEXT"
                                  ? "文本"
                                  : resourceType === "FILE"
                                    ? "文件"
                                    : "模型"}
                        素材
                    </p>
                    <p className="text-xs text-muted-foreground">
                        点击节点上的 ❤️ 图标收藏素材
                    </p>
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-3">
            <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">
                    作品集 ({materials.length})
                </p>
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={loadMaterials}
                    disabled={isLoading}
                >
                    <RefreshCw
                        className={cn("h-4 w-4", isLoading && "animate-spin")}
                    />
                </Button>
            </div>
            <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                {materials.map((material) => (
                    <MaterialItem
                        key={material.id}
                        material={material}
                        thumbnailUrl={
                            material.thumbnail
                                ? thumbnailUrls.get(material.thumbnail)
                                : undefined
                        }
                        isLoading={
                            material.thumbnail
                                ? thumbnailsLoading &&
                                  !thumbnailUrls.has(material.thumbnail)
                                : false
                        }
                        onSelect={handleSelect}
                        onDelete={handleDelete}
                    />
                ))}
            </div>
        </Card>
    );
};
