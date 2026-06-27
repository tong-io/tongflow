import { Handle, Position } from "@xyflow/react";
import {
    FileArchive,
    FileCode,
    File as FileIcon,
    FileSpreadsheet,
    FileText,
    Presentation,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import { DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useFileAsyncLoader } from "@/hooks/use-file-async-loader";
import { logger } from "@/lib/logger";
import type { RfDataNodeProps } from "@/types/nodes";
import { BaseNodeShell } from "../base/base-node-shell";
import {
    NodeHeader,
    NodeHeaderActions,
    NodeHeaderComboAction,
    NodeHeaderIcon,
    NodeHeaderMenuAction,
    NodeHeaderTitle,
} from "../base/node-header";
import { ModalityPlaceholder } from "./modality-placeholder";

type FileNodeRfProps = RfDataNodeProps<"fileNode">;

// Get the corresponding icon based on the file extension
const getFileIcon = (fileKey: string) => {
    const ext = fileKey.split(".").pop()?.toLowerCase() || "";

    // Document icons
    if (["pdf"].includes(ext)) {
        return <FileText className="h-8 w-8 text-red-500" />;
    }
    if (["doc", "docx"].includes(ext)) {
        return <FileText className="h-8 w-8 text-blue-500" />;
    }
    if (["txt"].includes(ext)) {
        return <FileText className="h-8 w-8 text-gray-500" />;
    }

    // Spreadsheet icons
    if (["xls", "xlsx", "csv"].includes(ext)) {
        return <FileSpreadsheet className="h-8 w-8 text-green-500" />;
    }

    // Presentation icons
    if (["ppt", "pptx"].includes(ext)) {
        return <Presentation className="h-8 w-8 text-orange-500" />;
    }

    // Code/Archive icons
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
        return <FileArchive className="h-8 w-8 text-purple-500" />;
    }
    if (["json", "xml", "html", "css", "js", "ts", "py"].includes(ext)) {
        return <FileCode className="h-8 w-8 text-cyan-500" />;
    }

    // Default icon
    return <FileIcon className="h-8 w-8 text-gray-400" />;
};

// Determine whether this is an Office file
const isOfficeFile = (fileKey: string): boolean => {
    const ext = fileKey.split(".").pop()?.toLowerCase() || "";
    return ["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext);
};

// Get the file open URL
const getFileOpenUrl = (fileUrl: string, fileKey: string): string => {
    const _ext = fileKey.split(".").pop()?.toLowerCase() || "";

    if (isOfficeFile(fileKey)) {
        // Preview using Office 365 Web Apps
        const encodedUrl = encodeURIComponent(fileUrl);
        return `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`;
    }

    // Open other files directly
    return fileUrl;
};

// Single file item component - loads the URL with a hook
const FileItem = ({
    fileKey,
    onFileClick,
}: {
    fileKey: string;
    onFileClick: (fileKey: string, url: string) => void;
}) => {
    const { url } = useFileAsyncLoader(fileKey, { priority: "high" });

    const handleClick = () => {
        if (url) {
            onFileClick(fileKey, url);
        }
    };

    return (
        <div
            className="flex flex-col items-center gap-2 cursor-pointer group"
            onClick={handleClick}
            title={fileKey}
        >
            <div className="p-3 rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors">
                {getFileIcon(fileKey)}
            </div>
            <p className="text-xs text-center text-gray-600 truncate max-w-[80px] group-hover:text-gray-900">
                {fileKey.split("/").pop()}
            </p>
        </div>
    );
};

// Single file display component
const SingleFileDisplay = ({
    fileKey,
    onFileClick,
}: {
    fileKey: string;
    onFileClick: (fileKey: string, url: string) => void;
}) => {
    const { url } = useFileAsyncLoader(fileKey, { priority: "high" });

    const handleClick = () => {
        if (url) {
            onFileClick(fileKey, url);
        }
    };

    return (
        <div className="flex flex-col items-center gap-2">
            <div
                className="p-4 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
                onClick={handleClick}
                title={fileKey}
            >
                {getFileIcon(fileKey)}
            </div>
            <p className="text-xs text-center text-gray-600 hover:text-gray-900 max-w-[120px] truncate">
                {fileKey.split("/").pop()}
            </p>
        </div>
    );
};

const FileNode = ({ selected, data }: FileNodeRfProps) => {
    const t = useTranslations("Workspace.nodes.modal");
    const keys: string[] = data.fileKeys ?? [];

    // Determine if single or multiple
    const isSingle = keys.length === 1;
    const count = keys.length;

    // Calculate display count: <=9 items; if total>9, show 8 + 1 "more"
    const showMore = count > 9;
    const visibleFileCount = showMore ? 8 : Math.min(count, 9);
    const visibleTiles = showMore ? 9 : visibleFileCount;
    const emptyTiles = Math.max(0, 9 - visibleTiles);

    const handleFileClick = (fileKey: string, fileUrl: string) => {
        const openUrl = getFileOpenUrl(fileUrl, fileKey);
        window.open(openUrl, "_blank");
    };

    return (
        <BaseNodeShell selected={selected} count={count}>
            <Handle
                type="target"
                position={Position.Left}
                id="in:fileNode"
                isConnectableStart={false}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="out:fileNode"
                isConnectableStart={false}
            />
            <NodeHeader>
                <NodeHeaderIcon>
                    <FileIcon />
                </NodeHeaderIcon>
                <NodeHeaderTitle>
                    {isSingle ? t("file") : t("files", { count })}
                </NodeHeaderTitle>
                <NodeHeaderActions>
                    <NodeHeaderComboAction
                        onClick={() => logger.debug("compose mode toggle")}
                    />
                    <NodeHeaderMenuAction label={t("moreOptions")}>
                        <DropdownMenuLabel>{t("actions")}</DropdownMenuLabel>
                    </NodeHeaderMenuAction>
                </NodeHeaderActions>
            </NodeHeader>

            {/* Content */}
            <div className="w-full p-4">
                {count === 0 ? (
                    // No files attached -> neutral modality placeholder
                    <ModalityPlaceholder modality="file" />
                ) : isSingle ? (
                    // Single file - show single icon
                    <SingleFileDisplay
                        fileKey={keys[0]}
                        onFileClick={handleFileClick}
                    />
                ) : (
                    // Multiple files - show grid
                    <div className="grid grid-cols-3 gap-4">
                        {/* Show file icons */}
                        {keys
                            .slice(0, visibleFileCount)
                            .map((fileKey, index) => (
                                <FileItem
                                    key={index}
                                    fileKey={fileKey}
                                    onFileClick={handleFileClick}
                                />
                            ))}

                        {/* Show "more" indicator if over 9 files */}
                        {showMore && (
                            <div className="flex flex-col items-center gap-2">
                                <div className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 w-16 h-16">
                                    <div className="text-center">
                                        <div className="text-sm font-bold text-gray-600">
                                            +{count - 8}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Empty placeholders */}
                        {Array.from({ length: emptyTiles }).map((_, index) => (
                            <div
                                key={`empty-${index}`}
                                className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 bg-gray-100 opacity-30"
                            />
                        ))}
                    </div>
                )}
            </div>
        </BaseNodeShell>
    );
};

// Custom comparison function to prevent unnecessary re-renders
const areEqual = (prevProps: FileNodeRfProps, nextProps: FileNodeRfProps) => {
    const prevFileKeys = prevProps.data.fileKeys || [];
    const nextFileKeys = nextProps.data.fileKeys || [];

    return (
        prevProps.selected === nextProps.selected &&
        JSON.stringify(prevFileKeys) === JSON.stringify(nextFileKeys)
    );
};

FileNode.displayName = "FileNode";

export default memo(FileNode, areEqual);
