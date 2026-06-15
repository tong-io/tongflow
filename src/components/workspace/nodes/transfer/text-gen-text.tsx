import { useNodesData } from "@xyflow/react";
import { Maximize2, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const GenTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"gen-text", "genTextNode">) => {
    const t = useTranslations("Workspace.nodes");
    const tBase = useTranslations("Workspace.nodes.base");
    const form = useAbiForm("gen-text");

    const { ids = [], texts: localTexts = [] } = data;

    // Composition mode: pull texts from associated nodes.
    const fromNodes = useNodesData(ids);
    const textNodes = fromNodes.filter((node) => node.type === "textNode");
    const texts: string[] = useMemo(() => {
        if (textNodes.length > 0) {
            return (textNodes[0].data as any)?.texts || [];
        }
        return localTexts;
    }, [textNodes, localTexts]);

    const upstreamPrompt: string = useMemo(() => {
        if (textNodes.length > 1) {
            const prompts = (textNodes[1].data as any)?.texts || [];
            return prompts[0] || "";
        }
        return "";
    }, [textNodes]);
    const hasUpstreamPrompt = !!upstreamPrompt;

    const userPrompt = (form.state.userPrompt as string | undefined) ?? "";
    const effectivePrompt = hasUpstreamPrompt ? upstreamPrompt : userPrompt;

    const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
    const [fullscreenValue, setFullscreenValue] = useState("");

    return (
        <>
            <AbiNodeShell
                feature="gen-text"
                sourceSpec={{
                    text: batchOn({ nodeType: "textNode", path: "texts" }),
                }}
                form={form}
                selected={selected}
                className="min-w-[480px]"
                data={data}
                title={t("titles.textGenText")}
                icon={<Wand2 className="h-5 w-5" />}
                executeLabel={tBase("execute")}
                executeDisabled={!effectivePrompt.trim() || !texts?.length}
                headerActions={
                    !hasUpstreamPrompt ? (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="nodrag size-6 p-1"
                            onClick={() => {
                                setFullscreenValue(userPrompt);
                                setIsFullscreenOpen(true);
                            }}
                            title={tBase("fullscreenEdit")}
                        >
                            <Maximize2 className="h-4 w-4" />
                        </Button>
                    ) : undefined
                }
            >
                <div className="p-4 space-y-4">
                    <div className="space-y-2">
                        {hasUpstreamPrompt ? (
                            <Card className="p-3 bg-muted/50">
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium text-muted-foreground">
                                        {t("textGenText.instructions")}
                                        {t("imageEdit.fromUpstream")}
                                    </Label>
                                    <div className="text-sm text-foreground p-2 bg-background rounded border border-border/50 max-h-32 overflow-y-auto">
                                        {upstreamPrompt}
                                    </div>
                                </div>
                            </Card>
                        ) : (
                            <NodeTextarea
                                rows={6}
                                placeholder={t("common.enterInstructions")}
                                {...form.bind("userPrompt")}
                                className="min-h-[120px] max-h-[200px] overflow-y-auto"
                                enableFullscreen={false}
                            />
                        )}
                    </div>
                </div>
            </AbiNodeShell>

            <Dialog
                open={isFullscreenOpen}
                onOpenChange={(open: boolean) => {
                    if (!open) setIsFullscreenOpen(false);
                }}
            >
                <DialogContent
                    className="w-[90vw] h-[90vh] max-w-none flex flex-col"
                    aria-describedby={undefined}
                >
                    <DialogHeader className="flex-shrink-0">
                        <DialogTitle>
                            {t("textGenText.instructions")}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 flex flex-col">
                        <Textarea
                            value={fullscreenValue}
                            onChange={(
                                e: React.ChangeEvent<HTMLTextAreaElement>,
                            ) => setFullscreenValue(e.target.value)}
                            placeholder={t("common.enterInstructions")}
                            className="resize-none h-full w-full overflow-y-auto flex-1"
                        />
                    </div>
                    <DialogFooter className="flex-shrink-0">
                        <Button
                            variant="outline"
                            onClick={() => setIsFullscreenOpen(false)}
                        >
                            {tBase("cancel")}
                        </Button>
                        <Button
                            onClick={() => {
                                form.set("userPrompt", fullscreenValue);
                                setIsFullscreenOpen(false);
                            }}
                        >
                            {tBase("confirm")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

GenTextNode.displayName = "GenTextNode";

export default memo(GenTextNode);
