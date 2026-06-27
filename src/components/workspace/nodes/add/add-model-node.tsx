import { Handle, type NodeProps, Position, useNodeId } from "@xyflow/react";
import { Box, Library, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import type React from "react";
import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import useFlow from "@/hooks/use-flow";
import { useMultipleUpload } from "@/hooks/use-upload";
import { logger } from "@/lib/logger";
import { LibInput } from "../../share/lib-input";
import { BaseNodeShell } from "../base/base-node-shell";

// Portfolio tab
const LibraryTab = () => {
    return (
        <div className="space-y-3">
            <Card className="p-3">
                <LibInput resourceType="MODEL" />
            </Card>
        </div>
    );
};

// Upload tab
const UploadTab = () => {
    const t = useTranslations("Workspace.nodes.add");
    const { expands } = useFlow();
    const id = useNodeId();
    const [isDragActive, setIsDragActive] = useState(false);

    const { upload, isUploading, progress } = useMultipleUpload({
        onSuccess: (responses) => {
            if (id && responses.length > 0) {
                const response = responses[0];
                // Expand into a modelNode after upload
                expands(id, [
                    {
                        type: "modelNode",
                        data: {
                            fileKeys: [response.key],
                        },
                    },
                ]);
            }
        },
        onError: (error) => {
            logger.error("Upload failed:", error);
        },
    });

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            await upload(Array.from(e.target.files));
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await upload(Array.from(e.dataTransfer.files));
        }
    };

    const supportedFormats = [
        ".glb",
        ".gltf",
        ".obj",
        ".fbx",
        ".stl",
        ".dae",
        ".ply",
        ".spz",
        ".splat",
        ".usdz",
    ];

    return (
        <div className="space-y-3">
            <Card className="p-3">
                <div
                    onDrop={handleDrop}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragActive(true);
                    }}
                    onDragLeave={() => setIsDragActive(false)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={`w-full h-48 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors cursor-pointer nodrag ${
                        isDragActive
                            ? "border-primary bg-primary/10"
                            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50"
                    }`}
                >
                    {isUploading ? (
                        <div className="w-full px-8 space-y-3">
                            <Progress value={progress} />
                            <p className="text-sm text-center text-muted-foreground font-medium">
                                {t("uploading")} {Math.round(progress)}%
                            </p>
                        </div>
                    ) : (
                        <>
                            <Upload className="h-10 w-10 mb-3 text-muted-foreground" />
                            <p className="text-sm font-medium text-foreground mb-1">
                                {isDragActive
                                    ? t("dropToUpload")
                                    : t("dragModel")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {t("supportedModelFormats")}:{" "}
                                {supportedFormats.join(", ")}
                            </p>
                            <label htmlFor={`model-upload-${id}`}>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="mt-3"
                                    asChild
                                >
                                    <span>{t("browseFiles")}</span>
                                </Button>
                            </label>
                            <input
                                id={`model-upload-${id}`}
                                type="file"
                                accept={supportedFormats
                                    .map((f) => `*${f}`)
                                    .join(",")}
                                onChange={handleFileChange}
                                className="hidden"
                            />
                        </>
                    )}
                </div>
            </Card>

            <Card className="p-3">
                <p className="text-xs text-muted-foreground">
                    <strong>{t("modelHint")}</strong>
                    <br />
                    GLB, glTF, OBJ, FBX, STL, DAE, PLY, SPZ, SPLAT, USDZ
                </p>
            </Card>
        </div>
    );
};

export const AddModelNode: React.FC<NodeProps> = ({ selected, data }) => {
    const t = useTranslations("Workspace.nodes.add");
    const id = useNodeId();
    const updates = useFlow((s) => s.updates);
    const _activeTab = (data as any)?.activeTab || "upload";

    // Save state when switching tabs
    const handleTabChange = (value: string) => {
        if (id) {
            updates(id, { ...data, activeTab: value });
        }
    };

    return (
        <BaseNodeShell
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("addModel")}
            icon={<Box className="h-5 w-5" />}
            isInputNode
            showPluginSelect={false}
        >
            <Handle
                type="source"
                position={Position.Right}
                id="out:modelNode"
                isConnectableStart={false}
            />
            <div className="p-4 space-y-2">
                <Tabs
                    defaultValue={(data as any)?.activeTab || "upload"}
                    className="w-full"
                    onValueChange={handleTabChange}
                >
                    <TabsList className="grid grid-cols-2 gap-2 bg-transparent h-auto p-0">
                        <TabsTrigger
                            key={"upload"}
                            value={"upload"}
                            className="h-9 flex flex-row items-center justify-center gap-2 data-[state=active]:bg-secondary"
                        >
                            <Upload className="h-4 w-4" />
                            <span className="text-xs font-medium">
                                {t("upload")}
                            </span>
                        </TabsTrigger>
                        <TabsTrigger
                            key={"library"}
                            value={"library"}
                            className="h-9 flex flex-row items-center justify-center gap-2 data-[state=active]:bg-secondary"
                        >
                            <Library className="h-4 w-4" />
                            <span className="text-xs font-medium">
                                {t("library")}
                            </span>
                        </TabsTrigger>
                    </TabsList>
                    <div className="mt-2">
                        <TabsContent
                            key={"upload"}
                            value={"upload"}
                            className="mt-0"
                        >
                            <UploadTab />
                        </TabsContent>
                        <TabsContent
                            key={"library"}
                            value={"library"}
                            className="mt-0"
                        >
                            <LibraryTab />
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </BaseNodeShell>
    );
};

AddModelNode.displayName = "AddModelNode";

export default memo(AddModelNode);
