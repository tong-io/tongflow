import React, { useState, useCallback, memo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Video, Upload, Camera, Library } from "lucide-react";
import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import useFlow from "@/hooks/use-flow";
import { Button } from "@/components/ui/button";
import { BaseNode } from "../base/base-node";
import { useMultipleUpload, useUpload } from "@/hooks/use-upload";
import { LibInput } from "../../share/lib-input";
import { VideoRecorder } from "@/components/ui/video-recorder";
import { useTranslations } from "next-intl";

// 文件上传组件
const UploadTab = () => {
    const t = useTranslations("Workspace.nodes.add");
    const expands = useFlow((s) => s.expands);
    const id = useNodeId();
    const [isDragActive, setIsDragActive] = useState(false);

    const { upload, isUploading, progress } = useMultipleUpload({
        onSuccess: (responses) => {
            if (id && responses.length > 0) {
                const fileKeys = responses.map((r) => r.key);
                expands(id, [{ type: "videoNode", data: { fileKeys } }]);
            }
        },
        onError: (error) => {
            console.error("Upload failed:", error);
        },
    });

    const doUpload = async (files: File[]) => {
        if (!id || files.length === 0) return;
        await upload(files);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await doUpload(Array.from(e.dataTransfer.files));
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            await doUpload(Array.from(e.target.files));
        }
    };

    return (
        <div className="w-full">
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
                        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                                className="bg-primary h-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
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
                                : t("dragOrClick")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {t("supportedVideoFormats")}
                        </p>
                        <label htmlFor={`video-upload-${id}`}>
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
                            id={`video-upload-${id}`}
                            type="file"
                            multiple
                            accept="video/*"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </>
                )}
            </div>
        </div>
    );
};

// 相机录制组件
const CameraTab = () => {
    const t = useTranslations("Workspace.nodes.add");
    const expands = useFlow((s) => s.expands);
    const id = useNodeId();
    const [blobUrl, setBlobUrl] = useState<string>("");
    const [isRecording, setIsRecording] = useState<boolean>(false);

    const { upload, isUploading, progress } = useUpload({
        onSuccess: (info) => {
            if (id) {
                expands(id, [
                    { type: "videoNode", data: { fileKeys: [info.key] } },
                ]);
                setIsRecording(false);
                setBlobUrl("");
            }
        },
        onError: (error) => {
            console.error("Upload failed:", error);
        },
    });

    const onFinish = async () => {
        if (!blobUrl) return;

        try {
            const response = await fetch(blobUrl);
            const blob = await response.blob();
            const file = new File([blob], `recording-${Date.now()}.mp4`, {
                type: "video/mp4",
            });
            upload(file);
        } catch (error) {
            console.error("Upload failed:", error);
        }
    };

    const handleCancel = () => {
        setIsRecording(false);
        setBlobUrl("");
    };

    return (
        <div className="w-full">
            {!isRecording ? (
                <Button
                    onClick={() => setIsRecording(true)}
                    variant="outline"
                    className="w-full h-32 flex flex-col gap-2 border-2 border-dashed hover:border-primary hover:bg-primary/5 transition-colors"
                >
                    <Video className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm">{t("recordVideo")}</span>
                </Button>
            ) : (
                <div className="w-full space-y-3">
                    <div className="w-full bg-muted rounded-lg overflow-hidden">
                        <VideoRecorder
                            onRecord={(blobUrl) => setBlobUrl(blobUrl ?? "")}
                        />
                    </div>

                    {isUploading && (
                        <div className="w-full space-y-2">
                            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                <div
                                    className="bg-primary h-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <p className="text-xs text-center text-muted-foreground">
                                {t("uploading")} {Math.round(progress)}%
                            </p>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={handleCancel}
                            disabled={isUploading}
                        >
                            {t("cancel")}
                        </Button>
                        <Button
                            size="sm"
                            className="flex-1"
                            onClick={onFinish}
                            disabled={!blobUrl || isUploading}
                        >
                            {isUploading
                                ? `${t("uploading")}...`
                                : t("generate")}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

// 作品集组件
const LibraryTab = () => {
    return (
        <div className="w-full">
            <LibInput resourceType="VIDEO" />
        </div>
    );
};

export const AddVideoNode: React.FC<NodeProps> = ({ selected, data }) => {
    const t = useTranslations("Workspace.nodes.add");
    const id = useNodeId();
    const updates = useFlow((s) => s.updates);
    const activeTab = (data as any)?.activeTab || "upload";

    console.log("AddVideoNode data:", data);

    // 处理Tab切换时保存状态
    const handleTabChange = (value: string) => {
        if (id) {
            updates(id, { ...data, activeTab: value });
        }
    };

    // 获取基础配置
    const getWorkflowConfig = useCallback(() => {
        return {
            feature: "",
            title: t("addVideo"),
            icon: <Video className="h-5 w-5" />,
            isInputNode: true,
        };
    }, [t]);

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={getWorkflowConfig()}
        >
            <div className="p-4 space-y-2">
                <Tabs
                    defaultValue={(data as any)?.activeTab || "upload"}
                    className="w-full"
                    onValueChange={handleTabChange}
                >
                    <TabsList className="grid grid-cols-3 gap-2 bg-transparent h-auto p-0">
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
                            key={"camera"}
                            value={"camera"}
                            className="h-9 flex flex-row items-center justify-center gap-2 data-[state=active]:bg-secondary"
                        >
                            <Video className="h-4 w-4" />
                            <span className="text-xs font-medium">
                                {t("recordVideo")}
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
                        <TabsContent value="upload" className="mt-0">
                            <UploadTab />
                        </TabsContent>
                        <TabsContent value="camera" className="mt-0">
                            <CameraTab />
                        </TabsContent>
                        <TabsContent value="library" className="mt-0">
                            <LibraryTab />
                        </TabsContent>
                    </div>
                </Tabs>
            </div>

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
    );
};

export default memo(AddVideoNode);
