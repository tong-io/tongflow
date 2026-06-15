import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { Duration } from "@/constants/media-options";
import { cn } from "@/lib/utils";

interface DurationPickerProps {
    durations: Duration[];
    value: string;
    onChange: (duration: string) => void;
}

export function DurationPicker({
    durations,
    value,
    onChange,
}: DurationPickerProps) {
    const t = useTranslations("Workspace.nodes");

    return (
        <Card className="p-3">
            <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {t("common.duration")}
                </Label>
                <div className="grid grid-cols-5 gap-2">
                    {durations.map((dur) => {
                        const isSelected = value === dur.value;
                        return (
                            <Button
                                key={dur.value}
                                variant={isSelected ? "default" : "outline"}
                                size="sm"
                                onClick={() => onChange(dur.value)}
                                className={cn(
                                    "h-auto py-2 px-1 text-xs transition-all",
                                    isSelected
                                        ? "bg-primary text-primary-foreground shadow-md"
                                        : "hover:bg-accent hover:text-accent-foreground",
                                )}
                            >
                                {dur.label}
                            </Button>
                        );
                    })}
                </div>
            </div>
        </Card>
    );
}
