import { Handle, type NodeProps, Position, useNodeId } from "@xyflow/react";
import {
    Camera,
    Image as ImageIcon,
    Library,
    Pencil,
    Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import React, { memo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WhiteBoard, type WhiteBoardRef } from "@/components/ui/whiteboard";
import useFlow from "@/hooks/use-flow";
import { useMultipleUpload, useUpload } from "@/hooks/use-upload";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { LibInput } from "../../share/lib-input";
import { BaseNodeShell } from "../base/base-node-shell";

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
                expands(id, [{ type: "imageNode", data: { fileKeys } }]);
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
        <div className="w-full">
            <div
                onDrop={handleDrop}
                onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragActive(true);
                }}
                onDragLeave={() => setIsDragActive(false)}
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                    "w-full h-48 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors nodrag",
                    isDragActive
                        ? "border-primary bg-primary/10"
                        : "border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50",
                )}
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
                            {t("supportedImageFormats")}
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
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </>
                )}
            </div>
        </div>
    );
};

// Canvas drawing component
const CanvasTab = () => {
    const t = useTranslations("Workspace.nodes.add");
    const expands = useFlow((s) => s.expands);
    const id = useNodeId();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dataUrl, setDataUrl] = useState<string>("");
    const whiteBoardRef = useRef<WhiteBoardRef>(null);

    const { upload, isUploading } = useUpload({
        onSuccess: (response) => {
            if (id) {
                expands(id, [
                    { type: "imageNode", data: { fileKeys: [response.key] } },
                ]);
                // Clear canvas and close dialog
                whiteBoardRef.current?.clear();
                setDataUrl("");
                setIsDialogOpen(false);
            }
        },
        onError: (error) => {
            logger.error("Error uploading canvas drawing:", error);
        },
    });

    // Convert data URL to Blob
    const dataURLtoBlob = (dataURL: string): Blob => {
        const arr = dataURL.split(",");
        const mime = arr[0]?.match(/:(.*?);/)?.[1] ?? "image/png";
        const bstr = atob(arr[1] ?? "");
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    };

    const onFinish = async () => {
        if (!dataUrl || !id) return;

        const blob = dataURLtoBlob(dataUrl);
        const file = new File([blob], `canvas-drawing-${Date.now()}.png`, {
            type: "image/png",
        });

        await upload(file);
    };

    const clearCanvas = () => {
        whiteBoardRef.current?.clear();
        setDataUrl("");
    };

    const handleCanvasDialogEvents = (
        e: React.MouseEvent | React.TouchEvent,
    ) => {
        e.stopPropagation();
    };

    return (
        <>
            <Button onClick={() => setIsDialogOpen(true)} className="w-full">
                <Pencil className="mr-2 h-4 w-4" />
                {t("openCanvas")}
            </Button>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent
                    className="max-w-2xl"
                    onMouseDown={handleCanvasDialogEvents}
                    onTouchStart={handleCanvasDialogEvents}
                >
                    <DialogHeader>
                        <DialogTitle>{t("canvasDrawing")}</DialogTitle>
                        <DialogDescription>
                            {t("canvasDrawingHint")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="w-full h-96 border rounded-lg overflow-hidden bg-white">
                        <WhiteBoard
                            ref={whiteBoardRef}
                            onChange={(dataUrl) => setDataUrl(dataUrl ?? "")}
                        />
                    </div>

                    <DialogFooter className="flex gap-2">
                        <Button
                            variant="outline"
                            onClick={clearCanvas}
                            disabled={isUploading}
                        >
                            {t("clearCanvas")}
                        </Button>
                        <Button
                            onClick={onFinish}
                            disabled={!dataUrl || isUploading}
                        >
                            {isUploading
                                ? `${t("uploading")}...`
                                : t("finishAndSave")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

// Library selection component
const LibraryTab = () => {
    return (
        <div className="w-full">
            <LibInput resourceType="IMAGE" />
        </div>
    );
};

// Camera component
const CameraTab = () => {
    const t = useTranslations("Workspace.nodes.add");
    const expands = useFlow((s) => s.expands);
    const id = useNodeId();
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string>("");
    const [videoReady, setVideoReady] = useState(false);
    const videoRef = React.useRef<HTMLVideoElement>(null);

    const { upload, isUploading } = useUpload({
        onSuccess: (response) => {
            if (id) {
                expands(id, [
                    { type: "imageNode", data: { fileKeys: [response.key] } },
                ]);
                stopCamera();
            }
        },
        onError: (error) => {
            logger.error("Failed to upload photo:", error);
        },
    });

    // Cleanup camera on component unmount
    React.useEffect(() => {
        return () => {
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, [stream]);

    // Set video source when stream changes
    React.useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    const startCamera = async () => {
        try {
            setError("");

            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: "user",
                },
                audio: false,
            });

            setStream(mediaStream);
        } catch (err) {
            logger.error("Error accessing camera:", err);
            setError(err instanceof Error ? err.message : t("cameraError"));
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
            setVideoReady(false);
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        }
    };

    const takePhoto = async () => {
        if (videoRef.current && videoRef.current.videoWidth > 0) {
            const canvas = document.createElement("canvas");
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            ctx.drawImage(videoRef.current, 0, 0);
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/png"),
            );

            if (blob) {
                const file = new File(
                    [blob],
                    `camera-photo-${Date.now()}.png`,
                    {
                        type: "image/png",
                    },
                );
                upload(file);
            }
        }
    };

    return (
        <div className="w-full flex flex-col items-center gap-4">
            {error && (
                <div className="w-full p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-600 text-sm">{error}</p>
                    <p className="text-red-500 text-xs mt-1">
                        {t("cameraErrorHint")}
                    </p>
                </div>
            )}

            {stream ? (
                <>
                    <div className="w-full border rounded-lg overflow-hidden bg-gray-100">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-64 object-cover"
                            onLoadedMetadata={() => {
                                if (videoRef.current) {
                                    setVideoReady(true);
                                }
                            }}
                            onCanPlay={() => {
                                setVideoReady(true);
                            }}
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={takePhoto}
                            disabled={!videoReady || isUploading}
                        >
                            {isUploading
                                ? `${t("uploading")}...`
                                : t("takePhoto")}
                        </Button>
                        <Button variant="outline" onClick={stopCamera}>
                            {t("closeCamera")}
                        </Button>
                    </div>
                </>
            ) : (
                <Button
                    onClick={startCamera}
                    className="w-full h-32 flex flex-col gap-2"
                >
                    <Camera className="h-8 w-8" />
                    <span>{t("clickToStartCamera")}</span>
                </Button>
            )}
        </div>
    );
};

export const AddImageNode: React.FC<NodeProps> = ({ selected, data }) => {
    const t = useTranslations("Workspace.nodes.add");
    const id = useNodeId();
    const updates = useFlow((s) => s.updates);
    const _activeTab = (data as any)?.activeTab || "upload";
    logger.debug("AddImageNode");

    // Save state on tab change
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
            title={t("addImage")}
            icon={<ImageIcon className="h-5 w-5" />}
            isInputNode
            showPluginSelect={false}
        >
            <Handle
                type="source"
                position={Position.Right}
                id="out:imageNode"
                isConnectableStart={false}
            />
            <div className="p-4 space-y-2">
                <Tabs
                    defaultValue={(data as any)?.activeTab || "upload"}
                    className="w-full"
                    onValueChange={handleTabChange}
                >
                    <TabsList className="grid grid-cols-4 gap-2 bg-transparent h-auto p-0">
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
                            <Camera className="h-4 w-4" />
                            <span className="text-xs font-medium">
                                {t("camera")}
                            </span>
                        </TabsTrigger>
                        <TabsTrigger
                            key={"canvas"}
                            value={"canvas"}
                            className="h-9 flex flex-row items-center justify-center gap-2 data-[state=active]:bg-secondary"
                        >
                            <Pencil className="h-4 w-4" />
                            <span className="text-xs font-medium">
                                {t("canvas")}
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
                            key={"camera"}
                            value={"camera"}
                            className="mt-0"
                        >
                            <CameraTab />
                        </TabsContent>
                        <TabsContent
                            key={"canvas"}
                            value={"canvas"}
                            className="mt-0"
                        >
                            <CanvasTab />
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

AddImageNode.displayName = "AddImageNode";

export default memo(AddImageNode);
