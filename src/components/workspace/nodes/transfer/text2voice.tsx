import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ReactNode } from "react";
import { useState, memo, useCallback, useRef } from "react";
import { Ear, Upload, Mic, Atom } from "lucide-react";
import { getR2Url } from "@/lib/r2-utils";

import { BaseNode } from "../base/base-node";
import { useNodeState } from "@/hooks/use-node-data";
import useFlow from "@/hooks/use-flow";
import { Card } from "@/components/ui/card";
import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

const Text2VoiceNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const tVoice = useTranslations("Workspace.nodes.voice");
    const { texts } = data as { texts: string[] };

    const expands = useFlow((s) => s.expands);

    const voiceOptions = [
        { label: t("common.voiceOptions.female"), value: "zh_famale_1.wav" },
        { label: t("common.voiceOptions.male"), value: "zh_male_1.wav" },
    ];

    const emotionOptions = [
        { label: t("emotions.none"), value: "" },
        { label: t("emotions.happy"), value: "happy" },
        { label: t("emotions.angry"), value: "angry" },
        { label: t("emotions.sad"), value: "sad" },
        { label: t("emotions.fear"), value: "fear" },
        { label: t("emotions.surprised"), value: "surprised" },
        { label: t("emotions.confusion"), value: "confusion" },
        { label: t("emotions.empathy"), value: "empathy" },
        { label: t("emotions.embarrass"), value: "embarrass" },
        { label: t("emotions.excited"), value: "excited" },
        { label: t("emotions.depressed"), value: "depressed" },
        { label: t("emotions.admiration"), value: "admiration" },
        { label: t("emotions.coldness"), value: "coldness" },
    ];

    // 使用新的Hook来管理状态持久化
    const [state, setState] = useNodeState(
        {
            voice: "zh_famale_1.wav",
            instruct: "",
            speakers: voiceOptions,
        },
        data,
    );
    const { voice, instruct, speakers } = state;

    // 音频播放引用
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // 试听音色
    const playVoicePreview = useCallback(() => {
        if (!voice || voice === "default") return;

        // 停止当前播放
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        const audioUrl = getR2Url(voice);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.play().catch((err) => {
            console.error("Failed to play audio:", err);
        });
    }, [voice]);

    // 自定义任务更新处理 - 因为返回字段是 fileKey
    const handleTaskUpdate = useCallback(
        (task: any) => {
            if (task?.status === "COMPLETED") {
                const fileKey = task?.data?.fileKey;
                if (fileKey) {
                    expands("", [
                        { type: "audioNode", data: { fileKeys: [fileKey] } },
                    ]);
                }
                return true; // 已处理，跳过默认逻辑
            }
            return false;
        },
        [expands],
    );

    const workflowConfig = {
        feature: "text_to_speech",
        label: "文本转语音",
        outputType: "audioNode",
        outputField: "fileKeys" as const,
        supportsBatch: true,
        batchParam: "text",
        paramMappings: {
            text: {
                sources: [upstreamParam("textNode", "texts")],
                required: true,
            },
            audio: {
                sources: [configParam("voice", "zh_famale_1.wav")],
            },
        },
    };

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.textGenSpeech"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.generateSpeech"),
                executeDisabled: !texts?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamTexts = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    const inputTexts =
                        upstreamTexts && upstreamTexts.length > 0
                            ? upstreamTexts
                            : texts;
                    return (
                        inputTexts?.map((text) => ({
                            audio: voice,
                            text: text,
                        })) || []
                    );
                },
                onTaskUpdate: handleTaskUpdate,
            }}
        >
            <Card
                className="p-5 nodrag"
                onPointerDown={(e) => e.stopPropagation()}
            >
                {/* 选择音色的下拉按钮（美化版） */}
                <div className="mb-4 flex flex-wrap items-center gap-3">
                    <label
                        htmlFor="voice-select"
                        className="text-sm text-muted-foreground whitespace-nowrap"
                    >
                        {tVoice("timbre")}
                    </label>
                    <Select
                        value={voice}
                        onValueChange={(value) => setState({ voice: value })}
                    >
                        <SelectTrigger id="voice-select" className="w-36 h-9">
                            <SelectValue placeholder={tVoice("selectTimbre")} />
                        </SelectTrigger>
                        <SelectContent>
                            {speakers.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {/* 下拉外部试听按钮 */}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-1"
                        title={tVoice("previewTimbre")}
                        onClick={playVoicePreview}
                        disabled={!voice || voice === "default"}
                    >
                        <Ear className="w-5 h-5 text-primary" />
                    </Button>
                    <SpeakerVoiceUploader
                        trigger={
                            <Button
                                variant="outline"
                                size="icon"
                                className="ml-1"
                                title={tVoice("uploadTimbre")}
                            >
                                <Upload className="w-4 h-4" />
                            </Button>
                        }
                        onChange={(key) => {
                            setState((prev) => ({
                                ...prev,
                                speakers: [
                                    ...prev.speakers,
                                    { label: key, value: key },
                                ],
                            }));
                        }}
                    ></SpeakerVoiceUploader>
                    <SpeakerVoiceRecorder
                        trigger={
                            <Button
                                variant="outline"
                                size="icon"
                                className="ml-1"
                                title={tVoice("recordTimbre")}
                            >
                                <Mic className="w-4 h-4" />
                            </Button>
                        }
                        onChange={(key) => {
                            setState((prev) => ({
                                ...prev,
                                speakers: [
                                    ...prev.speakers,
                                    { label: key, value: key },
                                ],
                            }));
                        }}
                    />
                </div>
                {/* 情感选择框 */}
                <div className="mb-4 flex items-center gap-3">
                    <label
                        htmlFor="emotion-select"
                        className="text-sm text-muted-foreground whitespace-nowrap"
                    >
                        {tVoice("emotion")}
                    </label>
                    <Select
                        value={instruct}
                        onValueChange={(value) => setState({ instruct: value })}
                    >
                        <SelectTrigger
                            id="emotion-select"
                            className="w-full h-9"
                        >
                            <SelectValue placeholder="选择情感风格（可选）" />
                        </SelectTrigger>
                        <SelectContent>
                            {emotionOptions.map((opt) => (
                                <SelectItem
                                    key={opt.value || "none"}
                                    value={opt.value || "none"}
                                >
                                    <span>{opt.label}</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </Card>
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

export default memo(Text2VoiceNode);

const SpeakerVoiceUploader = ({
    trigger,
    onChange,
}: {
    trigger: ReactNode;
    onChange: (key: string) => void;
}) => {
    const [uploaded, setUploaded] = useState<boolean>(false);
    const [progress, setProgress] = useState<number>(0);

    const doUpload = async (files: File[]) => {
        // 上传逻辑暂时简化
        // 实际实现需要调用上传API
        console.log("Uploading files:", files);
        setUploaded(true);
    };

    return (
        <label className="cursor-pointer">
            <input
                type="file"
                multiple
                hidden
                onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) {
                        doUpload(files);
                    }
                }}
            />
            {trigger}
        </label>
    );
};

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

    // 开始录制
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

                // 停止所有音轨
                stream.getTracks().forEach((track) => track.stop());
            };

            mediaRecorder.start(100); // 每 100ms 收集一次数据
            setIsRecording(true);
            setRecordingTime(0);

            // 计时器
            timerRef.current = setInterval(() => {
                setRecordingTime((prev) => prev + 1);
            }, 1000);
        } catch (err) {
            console.error("Failed to start recording:", err);
            setError(t("micError"));
        }
    };

    // 停止录制
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

    // 播放预览
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

    // 上传录制的音频
    const uploadRecording = async () => {
        if (!recordedBlob) return;

        setIsUploading(true);
        setError(null);

        try {
            // 创建 File 对象
            const extension = recordedBlob.type.includes("webm")
                ? "webm"
                : "mp4";
            const fileName = `voice_${Date.now()}.${extension}`;
            const file = new File([recordedBlob], fileName, {
                type: recordedBlob.type,
            });

            // 获取预签名 URL
            const { getPresignedUploadUrl } = await import("@/lib/api/upload");
            const { uploadUrl, fileKey } = await getPresignedUploadUrl(file);

            // 上传文件
            const uploadResponse = await fetch(uploadUrl, {
                method: "PUT",
                body: file,
                headers: {
                    "Content-Type": file.type,
                },
            });

            if (!uploadResponse.ok) {
                throw new Error("Upload failed");
            }

            // 成功，调用回调
            onChange(fileKey);
            setOpen(false);

            // 重置状态
            setRecordedBlob(null);
            setRecordingTime(0);
        } catch (err) {
            console.error("Upload failed:", err);
            setError(t("uploadError"));
        } finally {
            setIsUploading(false);
        }
    };

    // 格式化时间
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    // 重置
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
                    {/* 录制状态显示 */}
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

                    {/* 错误提示 */}
                    {error && <p className="text-sm text-red-500">{error}</p>}

                    {/* 操作按钮 */}
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
