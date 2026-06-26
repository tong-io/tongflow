import { Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { ResolutionTier } from "@/constants/media-options";
import { cn } from "@/lib/utils";

interface ResolutionPickerProps {
    tiers: ResolutionTier[];
    value: string;
    onChange: (tier: ResolutionTier) => void;
}

export function ResolutionPicker({
    tiers,
    value,
    onChange,
}: ResolutionPickerProps) {
    const t = useTranslations("Workspace.nodes");

    return (
        <Card className="p-3">
            <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Maximize2 className="h-4 w-4" />
                    {t("common.resolution")}
                </Label>
                <div className="grid grid-cols-3 gap-2">
                    {tiers.map((tier) => {
                        const isSelected = value === tier.value;
                        return (
                            <Button
                                key={tier.value}
                                variant={isSelected ? "default" : "outline"}
                                size="sm"
                                onClick={() => onChange(tier)}
                                className={cn(
                                    "h-auto py-2 px-1 text-xs transition-all",
                                    isSelected
                                        ? "bg-primary text-primary-foreground shadow-md"
                                        : "hover:bg-accent hover:text-accent-foreground",
                                )}
                            >
                                {tier.label}
                            </Button>
                        );
                    })}
                </div>
            </div>
        </Card>
    );
}
