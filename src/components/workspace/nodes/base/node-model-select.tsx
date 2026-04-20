"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export type NodeModelSelectOption = {
    value: string;
    label: ReactNode;
};

type NodeModelSelectProps = {
    value: string;
    onValueChange: (value: string) => void;
    options: NodeModelSelectOption[];
};

/**
 * Shared model slot selector (dropdown). Same layout as legacy text-gen-image / image-fusion.
 */
export function NodeModelSelect({
    value,
    onValueChange,
    options,
}: NodeModelSelectProps) {
    return (
        <Card className="p-3">
            <div className="space-y-2">
                <Label className="text-sm font-medium text-muted-foreground">
                    Model
                </Label>
                <Select value={value} onValueChange={onValueChange}>
                    <SelectTrigger className="w-full" size="sm">
                        <SelectValue />
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
