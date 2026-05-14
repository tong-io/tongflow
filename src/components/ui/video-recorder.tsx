"use client";

import { Camera, Circle, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface VideoRecorderProps {
    onRecord: (blobUrl?: string) => void;
    className?: string;
}

type RecordingStatus = "idle" | "recording" | "stopped";

export const VideoRecorder = ({ onRecord, className }: VideoRecorderProps) => {
    const t = useTranslations("Recorder");
    const [status, setStatus] = useState<RecordingStatus>("idle");
    const [mediaBlobUrl, setMediaBlobUrl] = useState<string>("");
    const [recordingTime, setRecordingTime] = useState(0);
    const [previewStream, setPreviewStream] = useState<MediaStream | null>(
        null,
    );

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup function
    const cleanup = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (previewStream) {
            previewStream.getTracks().forEach((track) => track.stop());
        }
    }, [previewStream]);

    // Start recording
    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: true,
            });

            setPreviewStream(stream);

            const mimeType = MediaRecorder.isTypeSupported("video/webm")
                ? "video/webm"
                : "video/mp4";

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: 2500000, // 2.5 Mbps
            });

            chunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mimeType });
                const url = URL.createObjectURL(blob);
                setMediaBlobUrl(url);
                onRecord(url);

                // Stop all tracks
                stream.getTracks().forEach((track) => track.stop());
                setPreviewStream(null);
            };

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start(1000); // Record data every second
            setStatus("recording");
            setRecordingTime(0);

            // Start the timer
            timerRef.current = setInterval(() => {
                setRecordingTime((prev) => prev + 1);
            }, 1000);
        } catch (error) {
            logger.error("Failed to start recording:", error);
            alert(t("videoPermissionError"));
        }
    }, [onRecord, t]);

    // Stop recording
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && status === "recording") {
            mediaRecorderRef.current.stop();
            setStatus("stopped");

            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
    }, [status]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup();
            if (mediaBlobUrl) {
                URL.revokeObjectURL(mediaBlobUrl);
            }
        };
    }, [cleanup, mediaBlobUrl]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    return (
        <div className={cn("relative w-full", className)}>
            {/* Preview area */}
            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
                {status === "idle" && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Button
                            size="lg"
                            onClick={startRecording}
                            className="flex items-center gap-2"
                        >
                            <Camera className="h-5 w-5" />
                            {t("videoStart")}
                        </Button>
                    </div>
                )}

                {status === "recording" && (
                    <>
                        <VideoPreview stream={previewStream} />
                        <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-full text-sm font-medium">
                            <Circle className="h-3 w-3 fill-current animate-pulse" />
                            {formatTime(recordingTime)}
                        </div>
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                            <Button
                                size="lg"
                                variant="destructive"
                                onClick={stopRecording}
                                className="flex items-center gap-2 shadow-lg"
                            >
                                <Square className="h-4 w-4" />
                                {t("videoStop")}
                            </Button>
                        </div>
                    </>
                )}

                {status === "stopped" && mediaBlobUrl && (
                    <div className="w-full h-full">
                        <video
                            src={mediaBlobUrl}
                            controls
                            autoPlay
                            loop
                            className="w-full h-full object-contain"
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

const VideoPreview = ({ stream }: { stream: MediaStream | null }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    if (!stream) {
        return null;
    }

    return (
        <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
        />
    );
};
