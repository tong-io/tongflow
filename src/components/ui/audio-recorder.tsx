"use client";
import { Mic, StopCircle, Trash } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { showErrorToast } from "@/components/ui/error-toast";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

interface Props {
    className?: string;
    timerClassName?: string;
    onRecord: (file: File) => void;
}

interface Record {
    id: number;
    name: string;
    file: any;
}

let recorder: MediaRecorder;
let recordingChunks: BlobPart[] = [];
let timerTimeout: NodeJS.Timeout;

// Utility function to pad a number with leading zeros
const padWithLeadingZeros = (num: number, length: number): string => {
    return String(num).padStart(length, "0");
};

export const AudioRecorderWithVisualizer = ({
    className,
    timerClassName: _timerClassName,
    onRecord,
}: Props) => {
    const t = useTranslations("Recorder");
    // States
    const [isRecording, setIsRecording] = useState<boolean>(false);
    const [_isRecordingFinished, setIsRecordingFinished] =
        useState<boolean>(false);
    const [timer, setTimer] = useState<number>(0);
    const [currentRecord, setCurrentRecord] = useState<Record>({
        id: -1,
        name: "",
        file: null,
    });
    // Calculate the hours, minutes, and seconds from the timer
    const hours = Math.floor(timer / 3600);
    const minutes = Math.floor((timer % 3600) / 60);
    const seconds = timer % 60;

    // Split the hours, minutes, and seconds into individual digits
    const [_hourLeft, _hourRight] = useMemo(
        () => padWithLeadingZeros(hours, 2).split(""),
        [hours],
    );
    const [_minuteLeft, _minuteRight] = useMemo(
        () => padWithLeadingZeros(minutes, 2).split(""),
        [minutes],
    );
    const [_secondLeft, _secondRight] = useMemo(
        () => padWithLeadingZeros(seconds, 2).split(""),
        [seconds],
    );
    // Refs
    const mediaRecorderRef = useRef<{
        stream: MediaStream | null;
        analyser: AnalyserNode | null;
        mediaRecorder: MediaRecorder | null;
        audioContext: AudioContext | null;
    }>({
        stream: null,
        analyser: null,
        mediaRecorder: null,
        audioContext: null,
    });
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<any>(null);

    const mimeType = MediaRecorder.isTypeSupported("audio/mpeg")
        ? "audio/mpeg"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/wav";

    function startRecording() {
        if (navigator.mediaDevices?.getUserMedia) {
            navigator.mediaDevices
                .getUserMedia({
                    audio: true,
                })
                .then((stream) => {
                    setIsRecording(true);
                    // ============ Analyzing ============
                    const AudioContext = window.AudioContext;
                    const audioCtx = new AudioContext();
                    const analyser = audioCtx.createAnalyser();
                    const source = audioCtx.createMediaStreamSource(stream);
                    source.connect(analyser);
                    mediaRecorderRef.current = {
                        stream,
                        analyser,
                        mediaRecorder: null,
                        audioContext: audioCtx,
                    };

                    const options = { mimeType };
                    mediaRecorderRef.current.mediaRecorder = new MediaRecorder(
                        stream,
                        options,
                    );
                    mediaRecorderRef.current.mediaRecorder.start();
                    recordingChunks = [];
                    // ============ Recording ============
                    recorder = new MediaRecorder(stream);
                    recorder.start();
                    recorder.ondataavailable = (e) => {
                        recordingChunks.push(e.data);
                    };
                })
                .catch((error) => {
                    showErrorToast({ message: t("audioPermissionError") });
                    logger.error(error);
                });
        }
    }
    function stopRecording() {
        recorder.onstop = () => {
            const recordBlob = new Blob(recordingChunks, {
                type: mimeType,
            });
            setCurrentRecord({
                ...currentRecord,
                file: window.URL.createObjectURL(recordBlob),
            });
            recordingChunks = [];

            const fileName = `recording-${Date.now()}.${mimeType.split("/")[1]}`;
            const file = new File([recordBlob], fileName, {
                type: mimeType,
            });
            onRecord(file);
        };

        recorder.stop();

        setIsRecording(false);
        setIsRecordingFinished(true);
        setTimer(0);
        clearTimeout(timerTimeout);
    }
    function resetRecording() {
        const { mediaRecorder, stream, analyser, audioContext } =
            mediaRecorderRef.current;

        if (mediaRecorder) {
            mediaRecorder.onstop = () => {
                recordingChunks = [];
            };
            mediaRecorder.stop();
        } else {
            logger.error("recorder instance is null");
        }

        // Stop the web audio context and the analyser node
        if (analyser) {
            analyser.disconnect();
        }
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
        }
        if (audioContext) {
            audioContext.close();
        }
        setIsRecording(false);
        setIsRecordingFinished(true);
        setTimer(0);
        clearTimeout(timerTimeout);

        // Clear the animation frame and canvas
        cancelAnimationFrame(animationRef.current || 0);
        const canvas = canvasRef.current;
        if (canvas) {
            const canvasCtx = canvas.getContext("2d");
            if (canvasCtx) {
                const WIDTH = canvas.width;
                const HEIGHT = canvas.height;
                canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
            }
        }
    }
    const handleSubmit = () => {
        stopRecording();
    };

    // Effect to update the timer every second
    useEffect(() => {
        if (isRecording) {
            timerTimeout = setTimeout(() => {
                setTimer(timer + 1);
            }, 1000);
        }
        return () => clearTimeout(timerTimeout);
    }, [isRecording, timer]);

    // Visualizer
    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const canvasCtx = canvas.getContext("2d");
        const WIDTH = canvas.width;
        const HEIGHT = canvas.height;

        const drawWaveform = (dataArray: Uint8Array) => {
            if (!canvasCtx) return;
            canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
            canvasCtx.fillStyle = "#939393";

            const barWidth = 1;
            const spacing = 1;
            const maxBarHeight = HEIGHT / 2.5;
            const numBars = Math.floor(WIDTH / (barWidth + spacing));

            for (let i = 0; i < numBars; i++) {
                const barHeight = (dataArray[i] / 128.0) ** 8 * maxBarHeight;
                const x = (barWidth + spacing) * i;
                const y = HEIGHT / 2 - barHeight / 2;
                canvasCtx.fillRect(x, y, barWidth, barHeight);
            }
        };

        const visualizeVolume = () => {
            if (
                !mediaRecorderRef.current?.stream
                    ?.getAudioTracks()[0]
                    ?.getSettings().sampleRate
            )
                return;
            const bufferLength =
                (mediaRecorderRef.current?.stream
                    ?.getAudioTracks()[0]
                    ?.getSettings().sampleRate as number) / 100;
            const dataArray = new Uint8Array(bufferLength);

            const draw = () => {
                if (!isRecording) {
                    cancelAnimationFrame(animationRef.current || 0);
                    return;
                }
                animationRef.current = requestAnimationFrame(draw);
                mediaRecorderRef.current?.analyser?.getByteTimeDomainData(
                    dataArray,
                );
                drawWaveform(dataArray);
            };

            draw();
        };

        if (isRecording) {
            visualizeVolume();
        } else {
            if (canvasCtx) {
                canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
            }
            cancelAnimationFrame(animationRef.current || 0);
        }

        return () => {
            cancelAnimationFrame(animationRef.current || 0);
        };
    }, [isRecording]);

    return (
        <div className={cn("w-full", className)}>
            {!isRecording ? (
                <div className="w-full flex flex-col items-center justify-center gap-3 py-8">
                    <Button
                        onClick={() => startRecording()}
                        size="lg"
                        className="flex items-center gap-2"
                    >
                        <Mic className="h-5 w-5" />
                        {t("audioStart")}
                    </Button>
                </div>
            ) : (
                <div className="w-full space-y-3">
                    {/* Waveform visualization area */}
                    <div className="relative w-full h-32 bg-muted rounded-lg overflow-hidden border">
                        <canvas
                            ref={canvasRef}
                            className="h-full w-full"
                            width={800}
                            height={128}
                        />
                        {/* Recording duration display */}
                        <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-full text-sm font-medium">
                            <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                            <span className="font-mono">
                                {padWithLeadingZeros(minutes, 2)}:
                                {padWithLeadingZeros(seconds, 2)}
                            </span>
                        </div>
                    </div>

                    {/* Control buttons */}
                    <div className="flex gap-2">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    onClick={resetRecording}
                                    size="sm"
                                    variant="outline"
                                    className="flex-1"
                                >
                                    <Trash className="h-4 w-4 mr-2" />
                                    {t("audioCancel")}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <span>{t("audioCancelTooltip")}</span>
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    onClick={handleSubmit}
                                    size="sm"
                                    className="flex-1"
                                >
                                    <StopCircle className="h-4 w-4 mr-2" />
                                    {t("audioFinish")}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <span>{t("audioFinishTooltip")}</span>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </div>
            )}
        </div>
    );
};
