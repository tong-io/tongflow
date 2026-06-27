import { Handle, type NodeProps, Position, useNodeId } from "@xyflow/react";
import { FileText, Library, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import useFlow from "@/hooks/use-flow";
import { useMultipleUpload } from "@/hooks/use-upload";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { LibInput } from "../../share/lib-input";
import { BaseNodeShell } from "../base/base-node-shell";

// Upload component
const UploadTab = () => {
    const t = useTranslations("Workspace.nodes.add");
    const { expands } = useFlow();
    const id = useNodeId();
    const [isDragActive, setIsDragActive] = useState(false);

    const { upload, isUploading, progress } = useMultipleUpload({
        onSuccess: (responses) => {
            if (id && responses.length > 0) {
                const fileKeys = responses.map((r) => r.key);
                expands(id, [{ type: "fileNode", data: { fileKeys } }]);
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

    return (
        <div
            onDrop={handleDrop}
            onDragOver={(e) => {
                e.preventDefault();
                setIsDragActive(true);
            }}
            onDragLeave={() => setIsDragActive(false)}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
                "w-full h-48 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors cursor-pointer nodrag",
                isDragActive
                    ? "border-primary bg-primary/10"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50",
            )}
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
                        {isDragActive ? t("dropToUpload") : t("dragOrClick")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {t("supportedDocFormats")}
                    </p>
                    <label htmlFor={`file-upload-${id}`}>
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
                        id={`file-upload-${id}`}
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.txt,.xlsx,.xls,.pptx,.ppt,.odt,.pages,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.oasis.opendocument.text"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                </>
            )}
        </div>
    );
};

// Library component
const LibraryTab = () => {
    return (
        <div className="w-full">
            <LibInput resourceType="FILE" />
        </div>
    );
};

const AddFileNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes.add");
    const id = useNodeId();
    const updates = useFlow((s) => s.updates);
    const activeTab = (data as any)?.activeTab || "upload";

    const handleTabChange = (value: string) => {
        if (id) {
            updates(id, { ...data, activeTab: value });
        }
    };

    return (
        <BaseNodeShell
            selected={selected}
            className="min-w-[360px]"
            data={data}
            title={t("addDocument")}
            icon={<FileText className="h-5 w-5" />}
            isInputNode
            showPluginSelect={false}
        >
            <Handle
                type="source"
                position={Position.Right}
                id="out:fileNode"
                isConnectableStart={false}
            />
            <div className="p-4 space-y-2">
                <Tabs
                    value={activeTab}
                    className="w-full"
                    onValueChange={handleTabChange}
                >
                    <TabsList className="grid grid-cols-2 gap-2 bg-transparent h-auto p-0">
                        <TabsTrigger
                            value="upload"
                            className="h-9 flex flex-row items-center justify-center gap-2 data-[state=active]:bg-secondary"
                        >
                            <Upload className="h-4 w-4" />
                            <span className="text-xs font-medium">
                                {t("upload")}
                            </span>
                        </TabsTrigger>
                        <TabsTrigger
                            value="library"
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
                        <TabsContent value="library" className="mt-0">
                            <LibraryTab />
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </BaseNodeShell>
    );
};

AddFileNode.displayName = "AddFileNode";

export default memo(AddFileNode);
