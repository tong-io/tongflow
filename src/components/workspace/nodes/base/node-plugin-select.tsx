"use client";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export type NodePluginSelectOption = {
    value: string;
    label: string;
};

type NodePluginSelectProps = {
    value: string;
    onValueChange: (value: string) => void;
    options: NodePluginSelectOption[];
};

/**
 * Shared plugin implementation selector (`plugins/<id>` directory name from registry).
 */
export function NodePluginSelect({
    value,
    onValueChange,
    options,
}: NodePluginSelectProps) {
    return (
        <Card className="p-3">
            <div className="space-y-2">
                <Label className="text-sm font-medium text-muted-foreground">
                    Implementation
                </Label>
                <Select value={value} onValueChange={onValueChange}>
                    <SelectTrigger className="w-full" size="sm">
                        <SelectValue placeholder="Select a repo…" />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </Card>
    );
}

