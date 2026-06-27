import { RectangleHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    type AspectRatio,
    getAspectRatioIconSize,
} from "@/constants/media-options";
import { cn } from "@/lib/utils";

interface AspectRatioPickerProps {
    ratios: AspectRatio[];
    value: AspectRatio;
    onChange: (ratio: AspectRatio) => void;
    showSize?: boolean;
}

export function AspectRatioPicker({
    ratios,
    value,
    onChange,
    showSize = true,
}: AspectRatioPickerProps) {
    const t = useTranslations("Workspace.nodes");

    return (
        <Card className="p-3">
            <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <RectangleHorizontal className="h-4 w-4" />
                    {t("common.aspectRatio")}
                </Label>
                <div className="grid grid-cols-5 gap-2">
                    {ratios.map((ratio) => {
                        const isSelected = value.value === ratio.value;
                        const iconSize = getAspectRatioIconSize(ratio.value);
                        return (
                            <Button
                                key={ratio.value}
                                variant={isSelected ? "default" : "outline"}
                                size="sm"
                                onClick={() => onChange(ratio)}
                                className={cn(
                                    "h-auto min-w-0 py-2 px-1 flex flex-row items-center gap-1 text-xs whitespace-normal transition-all",
                                    isSelected
                                        ? "bg-primary text-primary-foreground shadow-md"
                                        : "hover:bg-accent hover:text-accent-foreground",
                                )}
                            >
                                <div
                                    className={cn(
                                        "border rounded transition-colors flex-shrink-0",
                                        isSelected
                                            ? "border-primary-foreground bg-primary-foreground/20"
                                            : "border-muted-foreground/30 bg-muted/30",
                                    )}
                                    style={iconSize}
                                />
                                <div className="flex flex-col items-start min-w-0">
                                    <span className="text-xs font-medium leading-tight wrap-break-word text-left">
                                        {t(`options.${ratio.label}`)}
                                    </span>
                                    <span className="text-xs opacity-70 leading-tight">
                                        {ratio.value}
                                    </span>
                                </div>
                            </Button>
                        );
                    })}
                </div>
                {showSize && (
                    <div className="text-xs text-muted-foreground text-center">
                        {t("common.currentSize")} {value.width} × {value.height}
                    </div>
                )}
            </div>
        </Card>
    );
}
