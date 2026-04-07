import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ReactNode } from "react";
import { useState, memo } from "react";
import { Ear, Upload, Mic, Atom } from "lucide-react";

import { BaseNode } from "../base/base-node";
import { useNodeState } from "@/hooks/use-node-data";
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
    staticParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

const voiceOptions = [
    { key: "female", value: "zh_famale_1.wav" },
    { key: "male", value: "zh_male_1.wav" },
    // 可根据实际支持的音色扩展
];

// 工作流执行配置
const workflowConfig = {
    feature: "convert_voice",
    label: "替换音色",
    outputType: "audioNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "sourceKey",
    paramMappings: {
        sourceKey: {
            sources: [upstreamParam("audioNode", "fileKeys[0]")],
            required: true,
        },
        targetKey: {
            sources: [configParam("voice"), staticParam("zh_famale_1.wav")],
        },
    },
};

const ConvertVoiceNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { fileKeys } = data as { fileKeys: string[] };

    // 使用新的Hook来管理状态持久化
    const [state, setState] = useNodeState(
        {
            voice: "zh_famale_1.wav",
            speakers: voiceOptions,
        },
        data,
    );
    const { voice, speakers } = state;

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.convertVoice"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.startReplace"),
                executeDisabled: !fileKeys?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "audioNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;
                    return (
                        keys?.map((fileKey) => ({
                            sourceKey: fileKey,
                            targetKey: voice,
                        })) || []
                    );
                },
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
                        {t("convertVoice.voiceLabel")}
                    </label>
                    <Select
                        value={voice}
                        onValueChange={(value) => setState({ voice: value })}
                    >
                        <SelectTrigger id="voice-select" className="w-36 h-9">
                            <SelectValue
                                placeholder={t("convertVoice.selectVoice")}
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {speakers.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.key
                                        ? t(`common.voiceOptions.${opt.key}`)
                                        : opt.value}
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
                        title={t("convertVoice.previewVoice")}
                        onClick={async () => {
                            if (voice && voice !== "default") {
                                // 试听功能暂未实现
                                console.log("Playing audio:", voice);
                            }
                        }}
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
                                title={t("convertVoice.uploadVoice")}
                            >
                                <Upload className="w-4 h-4" />
                            </Button>
                        }
                        onChange={(key) => {
                            setState((prev) => ({
                                ...prev,
                                speakers: [
                                    ...prev.speakers,
                                    { key: "", value: key },
                                ],
                            }));
                        }}
                    />
                    <SpeakerVoiceRecorder
                        trigger={
                            <Button
                                variant="outline"
                                size="icon"
                                className="ml-1"
                                title={t("convertVoice.recordVoice")}
                            >
                                <Mic className="w-4 h-4" />
                            </Button>
                        }
                        onChange={(key) => {
                            setState((prev) => ({
                                ...prev,
                                speakers: [
                                    ...prev.speakers,
                                    { key: "", value: key },
                                ],
                            }));
                        }}
                    />
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

export default memo(ConvertVoiceNode);

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
        <div>
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
        </div>
    );
};

export const SpeakerVoiceRecorder = ({
    trigger,
    onChange,
}: {
    trigger: ReactNode;
    onChange: (key: string) => void;
}) => {
    const t = useTranslations("Workspace.nodes.convertVoice");
    const [file, setFile] = useState<File>();

    const onFinish = async () => {
        if (!file) return;
        // 录制上传逻辑暂时简化
        console.log("Recording file:", file);
    };

    return (
        <Dialog>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t("recordAudio")}</DialogTitle>
                    <DialogDescription>{t("recordHint")}</DialogDescription>
                </DialogHeader>
                <div className={"overflow-auto scroll-smooth w-80 max-h-80"}>
                    <p className="text-sm text-gray-500">
                        {t("recordNeedImpl")}
                    </p>
                </div>
                <DialogFooter className="sm:justify-start">
                    <DialogClose asChild>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => onFinish()}
                        >
                            {t("done")}
                        </Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
