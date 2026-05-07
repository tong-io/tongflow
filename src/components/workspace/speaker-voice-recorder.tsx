"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { logger } from "@/lib/logger";

export const SpeakerVoiceRecorder = ({
    trigger,
    onChange,
}: {
    trigger: ReactNode;
    onChange: (key: string) => void;
}) => {
    const t = useTranslations("Workspace.nodes.recorder");
    const [isRecording, setIsRecording] = useState(false);
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
    const [recordingTime, setRecordingTime] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

    const startRecording = async () => {
        try {
            setError(null);
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported("audio/webm")
                    ? "audio/webm"
                    : "audio/mp4",
            });

            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, {
                    type: mediaRecorder.mimeType,
                });
                setRecordedBlob(audioBlob);

                stream.getTracks().forEach((track) => track.stop());
            };

            mediaRecorder.start(100);
            setIsRecording(true);
            setRecordingTime(0);

            timerRef.current = setInterval(() => {
                setRecordingTime((prev) => prev + 1);
            }, 1000);
        } catch (err) {
            logger.error("Failed to start recording:", err);
            setError(t("micError"));
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);

            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
    };

    const playPreview = () => {
        if (recordedBlob) {
            if (audioPreviewRef.current) {
                audioPreviewRef.current.pause();
            }
            const audio = new Audio(URL.createObjectURL(recordedBlob));
            audioPreviewRef.current = audio;
            audio.play();
        }
    };

    const uploadRecording = async () => {
        if (!recordedBlob) return;

        setIsUploading(true);
        setError(null);

        try {
            const extension = recordedBlob.type.includes("webm")
                ? "webm"
                : "mp4";
            const fileName = `voice_${Date.now()}.${extension}`;
            const file = new File([recordedBlob], fileName, {
                type: recordedBlob.type,
            });

            const { getPresignedUploadUrl } = await import("@/lib/api/upload");
            const { fileKey } = await getPresignedUploadUrl(file);

            onChange(fileKey);
            setOpen(false);

            setRecordedBlob(null);
            setRecordingTime(0);
        } catch (err) {
            logger.error("Upload failed:", err);
            setError(t("uploadError"));
        } finally {
            setIsUploading(false);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    const resetRecording = () => {
        setRecordedBlob(null);
        setRecordingTime(0);
        setError(null);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("desc")}</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center gap-4 py-4">
                    <div className="flex flex-col items-center gap-2">
                        <div
                            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                                isRecording
                                    ? "bg-red-100 dark:bg-red-900/30 animate-pulse"
                                    : recordedBlob
                                      ? "bg-green-100 dark:bg-green-900/30"
                                      : "bg-muted"
                            }`}
                        >
                            {isRecording ? (
                                <div className="w-6 h-6 bg-red-500 rounded-sm" />
                            ) : recordedBlob ? (
                                <svg
                                    className="w-8 h-8 text-green-600"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 13l4 4L19 7"
                                    />
                                </svg>
                            ) : (
                                <svg
                                    className="w-8 h-8 text-muted-foreground"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                    />
                                </svg>
                            )}
                        </div>

                        <span className="text-2xl font-mono tabular-nums">
                            {formatTime(recordingTime)}
                        </span>

                        {isRecording && (
                            <span className="text-sm text-red-500 flex items-center gap-1">
                                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                {t("recording")}
                            </span>
                        )}

                        {recordedBlob && !isRecording && (
                            <span className="text-sm text-green-600">
                                {t("recorded")}
                            </span>
                        )}
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <div className="flex gap-2">
                        {!isRecording && !recordedBlob && (
                            <Button onClick={startRecording} variant="default">
                                {t("start")}
                            </Button>
                        )}

                        {isRecording && (
                            <Button
                                onClick={stopRecording}
                                variant="destructive"
                            >
                                {t("stop")}
                            </Button>
                        )}

                        {recordedBlob && !isRecording && (
                            <>
                                <Button onClick={playPreview} variant="outline">
                                    {t("preview")}
                                </Button>
                                <Button
                                    onClick={resetRecording}
                                    variant="outline"
                                >
                                    {t("retry")}
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                <DialogFooter className="sm:justify-between">
                    <DialogClose asChild>
                        <Button type="button" variant="ghost">
                            {t("cancel")}
                        </Button>
                    </DialogClose>
                    <Button
                        type="button"
                        onClick={uploadRecording}
                        disabled={!recordedBlob || isRecording || isUploading}
                    >
                        {isUploading ? t("uploading") : t("confirm")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
