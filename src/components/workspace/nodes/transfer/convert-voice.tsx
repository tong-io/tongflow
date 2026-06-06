import { Atom, Mic, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { memo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import { logger } from "@/lib/logger";
import type { RfDataNodeProps } from "@/types/nodes";

import { AbiNodeShell } from "../base/abi-node-shell";

type ConvertVoiceRfProps = RfDataNodeProps<"convertVoiceNode">;

const VOICE_OPTIONS = [
    { key: "female", value: "zh_famale_1.wav" },
    { key: "male", value: "zh_male_1.wav" },
];

const ConvertVoiceNode = ({ selected, data }: ConvertVoiceRfProps) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("convert_voice");
    const fileKeys = data.fileKeys;

    const [extraSpeakers, setExtraSpeakers] = useState<
        { key: string; value: string }[]
    >([]);
    const speakers = [...VOICE_OPTIONS, ...extraSpeakers];

    const targetKey = (form.state.targetKey as string) ?? "zh_famale_1.wav";

    return (
        <AbiNodeShell
            feature="convert_voice"
            sourceSpec={{ sourceKey: batchOn({ nodeType: "audioNode" }) }}
            form={form}
            selected={selected}
            data={data}
            title={t("titles.convertVoice")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.startReplace")}
            executeDisabled={!fileKeys?.length}
        >
            <Card
                className="p-5 nodrag"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex flex-wrap items-center gap-3">
                    <label
                        htmlFor="voice-select"
                        className="text-sm text-muted-foreground whitespace-nowrap"
                    >
                        {t("convertVoice.voiceLabel")}
                    </label>
                    <Select
                        value={targetKey}
                        onValueChange={(value) => form.set("targetKey", value)}
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
                            setExtraSpeakers((prev) => [
                                ...prev,
                                { key: "", value: key },
                            ]);
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
                            setExtraSpeakers((prev) => [
                                ...prev,
                                { key: "", value: key },
                            ]);
                        }}
                    />
                </div>
            </Card>
        </AbiNodeShell>
    );
};

export default memo(ConvertVoiceNode);

const SpeakerVoiceUploader = ({
    trigger,
    onChange: _onChange,
}: {
    trigger: ReactNode;
    onChange: (key: string) => void;
}) => {
    const [_uploaded, setUploaded] = useState<boolean>(false);

    const doUpload = async (files: File[]) => {
        logger.debug("Uploading files:", files);
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
    onChange: _onChange,
}: {
    trigger: ReactNode;
    onChange: (key: string) => void;
}) => {
    const t = useTranslations("Workspace.nodes.convertVoice");
    const [file, _setFile] = useState<File>();

    const onFinish = async () => {
        if (!file) return;
        logger.debug("Recording file:", file);
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
