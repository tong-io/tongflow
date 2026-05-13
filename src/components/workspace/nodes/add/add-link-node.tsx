import { Link as LinkIcon, Plus, Trash } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAbiForm } from "@/hooks/use-abi-form";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";

const AddLinkNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"link", "addLinkNode">) => {
    const t = useTranslations("Workspace.nodes.add");
    const form = useAbiForm("link");

    // Local list state (not part of the ABI input shape).
    const [input, setInput] = useState("");
    const [previews, setPreviews] = useState<string[]>(
        () => (data as any).previews ?? [],
    );

    const handleAdd = () => {
        if (!input.trim()) return;
        const urlMatch = input.trim().match(/https?:\/\/[^\s]+/);
        if (!urlMatch) return;
        setPreviews((prev) => [...prev, urlMatch[0]]);
        setInput("");
    };

    const handleRemovePreview = (index: number) => {
        setPreviews((prev) => prev.filter((_, i) => i !== index));
    };

    // Local-array batch: emit one ABI prompt per stored URL, preserving any
    // fields `buildPrompts` already merged (e.g. plugin routing).
    const transformPrompts = useCallback(
        (built: Record<string, unknown>[]) => {
            const base = built[0] ?? {};
            return previews.map((url) => ({ ...base, url }));
        },
        [previews],
    );

    return (
        <AbiNodeShell
            feature="link"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("addLink")}
            icon={<LinkIcon className="h-5 w-5" />}
            executeLabel={t("extractContent")}
            executeDisabled={previews.length === 0}
            isInputNode
            transformPrompts={transformPrompts}
        >
            <div className="p-4 space-y-2">
                {previews.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {previews.map((preview, idx) => (
                            <Card
                                key={idx}
                                className="p-3 relative rounded-lg border hover:shadow-sm transition-all"
                            >
                                <button
                                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
                                    onClick={() => handleRemovePreview(idx)}
                                >
                                    <Trash size={14} />
                                </button>
                                <div className="pr-6">
                                    <h3 className="font-semibold text-sm mb-1 truncate">
                                        {preview || t("linkPlaceholder")}
                                    </h3>
                                    <a
                                        href={preview}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-primary text-xs hover:underline break-all line-clamp-2"
                                    >
                                        {preview}
                                    </a>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}

                <div
                    className="flex gap-2 items-center nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <Input
                        placeholder={t("linkPlaceholder")}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="flex-1 h-10"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleAdd();
                            }
                        }}
                    />
                    <Button
                        variant="outline"
                        size="default"
                        onClick={handleAdd}
                        className="h-10 px-3"
                    >
                        <Plus size={16} className="mr-1" /> {t("generate")}
                    </Button>
                </div>
            </div>
        </AbiNodeShell>
    );
};

AddLinkNode.displayName = "AddLinkNode";

export default memo(AddLinkNode);
