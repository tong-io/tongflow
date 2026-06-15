import {
    Box,
    FileText,
    Image as ImageIcon,
    type LucideIcon,
    Music,
    Type,
    Video,
} from "lucide-react";
import { useTranslations } from "next-intl";

// Modalities that can render a neutral fallback when their content is missing,
// fails to load, or is otherwise invalid.
export type PlaceholderModality =
    | "image"
    | "video"
    | "audio"
    | "text"
    | "file"
    | "model";

// Icon + label per modality. Icons mirror the smart-island add toolbar so a
// failed asset reads as the same modality the user originally added.
const MODALITY_META: Record<
    PlaceholderModality,
    { icon: LucideIcon; labelKey: string }
> = {
    image: { icon: ImageIcon, labelKey: "image" },
    video: { icon: Video, labelKey: "video" },
    audio: { icon: Music, labelKey: "audio" },
    text: { icon: Type, labelKey: "text" },
    file: { icon: FileText, labelKey: "file" },
    model: { icon: Box, labelKey: "model3D" },
};

interface ModalityPlaceholderProps {
    modality: PlaceholderModality;
    // "card" fills the main node body; "thumb" fits a compact grid tile.
    variant?: "card" | "thumb";
    className?: string;
}

/**
 * Neutral, on-brand placeholder shown when a modality node's content cannot be
 * displayed (missing key, load failure, or invalid asset). Communicates which
 * modality belongs here via a muted icon and label.
 */
export function ModalityPlaceholder({
    modality,
    variant = "card",
    className,
}: ModalityPlaceholderProps) {
    const t = useTranslations("Workspace.nodes.modal");
    const { icon: Icon, labelKey } = MODALITY_META[modality];

    if (variant === "thumb") {
        return (
            <div
                className={`flex h-full w-full flex-col items-center justify-center gap-1 bg-gray-50 text-gray-300 dark:bg-slate-800/60 dark:text-gray-600 ${className ?? ""}`}
            >
                <Icon className="h-6 w-6" strokeWidth={1.5} />
            </div>
        );
    }

    return (
        <div
            className={`flex w-full select-none flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center dark:border-gray-700 dark:bg-slate-800/60 ${className ?? ""}`}
        >
            <Icon
                className="h-10 w-10 text-gray-300 dark:text-gray-600"
                strokeWidth={1.5}
            />
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t(labelKey)}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">
                {t("unavailable")}
            </div>
        </div>
    );
}
