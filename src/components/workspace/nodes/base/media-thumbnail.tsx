import { memo } from "react";
import { useFileAsyncLoader } from "@/hooks/use-file-async-loader";

interface MediaThumbnailProps {
    fileKey?: string;
    label: string;
    type: "image" | "audio" | "video";
    loadingText?: string;
    onClick?: () => void;
}

export const MediaThumbnail = memo(
    ({
        fileKey,
        label,
        type,
        loadingText = "...",
        onClick,
    }: MediaThumbnailProps) => {
        const { url } = useFileAsyncLoader(fileKey, { priority: "high" });

        const colorMap = {
            image: { bg: "bg-purple-100", text: "text-purple-700" },
            video: { bg: "bg-orange-100", text: "text-orange-700" },
            audio: { bg: "bg-blue-100", text: "text-blue-700" },
        } as const;
        const colors = colorMap[type];

        return (
            <div
                className="flex flex-col items-center gap-1.5"
                onClick={onClick}
            >
                <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100 transition-colors">
                    {type === "image" ? (
                        url ? (
                            <img
                                src={url}
                                alt={label}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <Placeholder text={loadingText} />
                        )
                    ) : type === "video" ? (
                        url ? (
                            <video
                                src={url}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <Placeholder text={loadingText} />
                        )
                    ) : (
                        <div className="flex items-center justify-center h-full w-full bg-blue-50">
                            <div className="text-xs text-blue-600 font-semibold">
                                🎵
                            </div>
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 transition-colors" />
                </div>
                <div
                    className={`px-1.5 py-0.5 text-xs font-medium rounded ${colors.bg} ${colors.text}`}
                >
                    {label}
                </div>
            </div>
        );
    },
);

MediaThumbnail.displayName = "MediaThumbnail";

function Placeholder({ text }: { text: string }) {
    return (
        <div className="flex items-center justify-center h-full w-full">
            <div className="text-xs text-gray-400">{text}</div>
        </div>
    );
}
