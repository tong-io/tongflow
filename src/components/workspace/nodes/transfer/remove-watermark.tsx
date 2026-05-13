import { Droplets } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { Card } from "@/components/ui/card";
import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { RfDataNodeProps } from "@/types/nodes";

import { AbiNodeShell } from "../base/abi-node-shell";

type RemoveWatermarkRfProps = RfDataNodeProps<"removeWatermarkNode">;

const RemoveWatermarkNode = ({ selected, data }: RemoveWatermarkRfProps) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("remove_watermark");
    const fileKeys = data.fileKeys;

    return (
        <AbiNodeShell
            feature="remove_watermark"
            sourceSpec={{ fileKey: batchOn({ nodeType: "videoNode" }) }}
            form={form}
            selected={selected}
            data={data}
            title={t("titles.removeWatermark")}
            icon={<Droplets className="h-5 w-5" />}
            executeLabel={t("actions.removeWatermark")}
            executeDisabled={!fileKeys?.length}
        >
            <Card className="p-5 space-y-4">
                <div className="text-sm text-muted-foreground">
                    {t("removeWatermark.hint")}
                </div>
            </Card>
        </AbiNodeShell>
    );
};

export default memo(RemoveWatermarkNode);
