import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Atom, Mic, Music } from "lucide-react";
import { memo, useMemo } from "react";
import { useTranslations } from "use-intl";
import type { RfDataNodeProps } from "../../../core";
import { collectHandleValues } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";
import { useNodeAbiSpec } from "../../hooks/use-node-abi-spec";
import { Card } from "../../ui/card";
import { Label } from "../../ui/label";

import { AbiNodeShell } from "../base/abi-node-shell";
import { MediaThumbnail } from "../base/media-thumbnail";

type ConvertVoiceRfProps = RfDataNodeProps<"convertVoiceNode">;

const firstKey = (value: unknown): string | undefined => {
    const v = Array.isArray(value) ? value[0] : value;
    return typeof v === "string" && v ? v : undefined;
};

const ConvertVoiceNode = ({ selected, data }: ConvertVoiceRfProps) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("convert_voice");

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const resolvedSpec = useNodeAbiSpec("convert_voice");

    const { sourceKey, refKey } = useMemo(() => {
        if (!nodeId) return { sourceKey: undefined, refKey: undefined };
        const values = collectHandleValues(
            nodeId,
            resolvedSpec,
            Array.from(nodeLookup.values()),
            edges,
        );
        return {
            sourceKey: firstKey(values.audio),
            refKey: firstKey(values.ref_audio),
        };
    }, [nodeId, resolvedSpec, nodeLookup, edges]);

    return (
        <AbiNodeShell
            feature="convert_voice"
            form={form}
            selected={selected}
            className="min-w-[360px]"
            data={data}
            title={t("titles.convertVoice")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.startReplace")}
            executeDisabled={!sourceKey || !refKey}
        >
            <div className="p-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.inputData")}
                        </Label>
                        <div className="flex gap-4">
                            {sourceKey ? (
                                <MediaThumbnail
                                    fileKey={sourceKey}
                                    label={t("convertVoice.sourceAudio")}
                                    type="audio"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100">
                                        <div className="flex items-center justify-center h-full w-full bg-orange-50">
                                            <Music className="w-6 h-6 text-orange-600" />
                                        </div>
                                    </div>
                                    <div className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">
                                        {t("convertVoice.sourceAudio")}
                                    </div>
                                </div>
                            )}
                            {refKey ? (
                                <MediaThumbnail
                                    fileKey={refKey}
                                    label={t("convertVoice.referenceVoice")}
                                    type="audio"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100">
                                        <div className="flex items-center justify-center h-full w-full bg-blue-50">
                                            <Mic className="w-6 h-6 text-blue-600" />
                                        </div>
                                    </div>
                                    <div className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                        {t("convertVoice.referenceVoice")}
                                    </div>
                                </div>
                            )}
                        </div>
                        {(!sourceKey || !refKey) && (
                            <p className="text-xs text-red-500">
                                {t("convertVoice.connectHint")}
                            </p>
                        )}
                    </div>
                </Card>
            </div>
        </AbiNodeShell>
    );
};

ConvertVoiceNode.displayName = "ConvertVoiceNode";

export default memo(ConvertVoiceNode);
