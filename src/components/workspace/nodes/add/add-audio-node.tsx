import { Handle, type NodeProps, Position, useNodeId } from "@xyflow/react";
import { Library, Mic, Music, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import type React from "react";
import { memo, useState } from "react";
import { AudioRecorderWithVisualizer } from "@/components/ui/audio-recorder";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import useFlow from "@/hooks/use-flow";
import { useMultipleUpload, useUpload } from "@/hooks/use-upload";
import { logger } from "@/lib/logger";
import { LibInput } from "../../share/lib-input";
import { BaseNodeShell } from "../base/base-node-shell";

// Recording component
const RecordTab = () => {
    const t = useTranslations("Workspace.nodes.add");
    const expands = useFlow((s) => s.expands);
    const id = useNodeId();
    const [file, setFile] = useState<File>();

    const { upload, isUploading, progress, error } = useUpload({
        onSuccess: (info) => {
            if (id) {
                expands(id, [
                    { type: "audioNode", data: { fileKeys: [info.key] } },
                ]);
                setFile(undefined);
            }
        },
        onError: (error) => {
            logger.error("Upload failed:", error);
        },
    });

    const onFinish = async () => {
        if (!file) return;
        upload(file);
    };

    return (
        <div className="w-full space-y-3">
            <TooltipProvider>
                <AudioRecorderWithVisualizer
                    onRecord={(file) => {
                        setFile(file);
                    }}
                />
            </TooltipProvider>

            {file && !isUploading && (
                <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground truncate">
                        {t("recorded")}: {file.name}
                    </p>
                </div>
            )}

            {isUploading && (
                <div className="space-y-2">
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

            {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-sm text-destructive">{error.message}</p>
                </div>
            )}

            {file && !isUploading && (
                <Button
                    onClick={onFinish}
                    disabled={!file || isUploading}
                    size="sm"
                    className="w-full"
                >
                    {t("confirmAndUpload")}
                </Button>
            )}
        </div>
    );
};

// File upload component
const UploadTab = () => {
    const t = useTranslations("Workspace.nodes.add");
    const expands = useFlow((s) => s.expands);
    const id = useNodeId();
    const [isDragActive, setIsDragActive] = useState(false);

    const { upload, isUploading, progress } = useMultipleUpload({
        onSuccess: (responses) => {
            if (id && responses.length > 0) {
                const fileKeys = responses.map((r) => r.key);
                expands(id, [{ type: "audioNode", data: { fileKeys } }]);
            }
        },
        onError: (error) => {
            logger.error("Upload failed:", error);
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
                            {t("supportedAudioFormats")}
                        </p>
                        <label htmlFor={`audio-upload-${id}`}>
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
                            id={`audio-upload-${id}`}
                            type="file"
                            multiple
                            accept="audio/*,.mp3,.wav,.ogg,.m4a"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </>
                )}
            </div>
        </div>
    );
};

// Library component
const LibraryTab = () => {
    return (
        <div className="w-full">
            <LibInput resourceType="AUDIO" />
        </div>
    );
};

export const AddAudioNode: React.FC<NodeProps> = ({ selected, data }) => {
    const t = useTranslations("Workspace.nodes.add");
    const id = useNodeId();
    const updates = useFlow((s) => s.updates);
    const _activeTab = (data as any)?.activeTab || "upload";

    const handleTabChange = (value: string) => {
        if (id) updates(id, { ...data, activeTab: value });
    };

    return (
        <BaseNodeShell
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("addAudio")}
            icon={<Music className="h-5 w-5" />}
            isInputNode
            showPluginSelect={false}
        >
            <Handle
                type="source"
                position={Position.Right}
                id="out:audioNode"
                isConnectableStart={false}
            />
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
                            key={"record"}
                            value={"record"}
                            className="h-9 flex flex-row items-center justify-center gap-2 data-[state=active]:bg-secondary"
                        >
                            <Mic className="h-4 w-4" />
                            <span className="text-xs font-medium">
                                {t("record")}
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
                        <TabsContent value="record" className="mt-0">
                            <RecordTab />
                        </TabsContent>
                        <TabsContent value="library" className="mt-0">
                            <LibraryTab />
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </BaseNodeShell>
    );
};

export default memo(AddAudioNode);
