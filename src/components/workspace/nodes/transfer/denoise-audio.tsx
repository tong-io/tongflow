import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { RfDataNodeProps } from "@/types/nodes";

import { AbiNodeShell } from "../base/abi-node-shell";

type DenoiseAudioRfProps = RfDataNodeProps<"denoiseAudioSubtitleNode">;

const DenoiseAudioNode = ({ selected, data }: DenoiseAudioRfProps) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("denoise_audio");
    const fileKeys = data.fileKeys;

    return (
        <AbiNodeShell
            feature="denoise_audio"
            sourceSpec={{ fileKey: batchOn({ nodeType: "audioNode" }) }}
            form={form}
            selected={selected}
            data={data}
            title={t("titles.denoiseAudio")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.startDenoise")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

export default memo(DenoiseAudioNode);
