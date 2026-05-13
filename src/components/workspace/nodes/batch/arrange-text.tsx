import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";
import { collectAll } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const ArrangeTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"arrange-group", "arrangeNode">) => {
    const t = useTranslations("Workspace.nodes.batch");
    const form = useAbiForm("arrange-group", {
        fileKeys: collectAll({ nodeType: "videoNode" }),
    });
    const infos = data.infos ?? [];
    const groupCount = (form.state.groupCount as number | undefined) ?? 3;
    const duplicatable =
        (form.state.duplicatable as boolean | undefined) ?? true;

    return (
        <AbiNodeShell
            feature="arrange-group"
            sourceSpec={{ fileKeys: collectAll({ nodeType: "videoNode" }) }}
            form={form}
            selected={selected}
            data={data}
            title={t("arrangeGroup")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("startArrange")}
            executeDisabled={!infos?.length}
        >
            <Card
                className="p-5 space-y-4 nodrag"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <NodeTextarea
                    showCard={false}
                    rows={6}
                    placeholder={t("describeRequirements")}
                    {...form.bind("query")}
                />

                <div className="flex items-center justify-between">
                    <Label htmlFor="groupCount">{t("groupCount")}</Label>
                    <Input
                        id="groupCount"
                        type="number"
                        min={1}
                        value={groupCount}
                        onChange={(e) =>
                            form.set("groupCount", Number(e.target.value))
                        }
                        className="w-24"
                    />
                </div>

                <div className="flex items-center justify-between">
                    <Label htmlFor="duplicatable">{t("allowDuplicate")}</Label>
                    <input
                        id="duplicatable"
                        type="checkbox"
                        checked={duplicatable}
                        onChange={(e) =>
                            form.set("duplicatable", e.target.checked)
                        }
                        className="w-4 h-4 rounded border-gray-300"
                    />
                </div>
            </Card>
        </AbiNodeShell>
    );
};

export default memo(ArrangeTextNode);
