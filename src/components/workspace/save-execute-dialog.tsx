"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SaveExecuteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isNewWorkflow: boolean;
    tempName: string;
    tempDescription: string;
    onNameChange: (value: string) => void;
    onDescriptionChange: (value: string) => void;
    onConfirm: () => void;
    isSaving: boolean;
}

export function SaveExecuteDialog({
    open,
    onOpenChange,
    isNewWorkflow,
    tempName,
    tempDescription,
    onNameChange,
    onDescriptionChange,
    onConfirm,
    isSaving,
}: SaveExecuteDialogProps) {
    const t = useTranslations("Workspace.smartIsland");

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>
                        {isNewWorkflow
                            ? t("saveWorkflow")
                            : t("executeWorkflow")}
                    </DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground mb-4">
                    {isNewWorkflow
                        ? t("executeConfirmDescNew")
                        : t("executeConfirmDescSaved")}
                </p>

                {isNewWorkflow && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="workflow-name">
                                {t("workflowName")}
                            </Label>
                            <Input
                                id="workflow-name"
                                value={tempName}
                                onChange={(e) => onNameChange(e.target.value)}
                                placeholder={t("workflowNamePlaceholder")}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="workflow-description">
                                {t("workflowDescription")}
                            </Label>
                            <Textarea
                                id="workflow-description"
                                value={tempDescription}
                                onChange={(e) =>
                                    onDescriptionChange(e.target.value)
                                }
                                placeholder={t("workflowDescPlaceholder")}
                                rows={3}
                            />
                        </div>
                    </div>
                )}
                <DialogFooter className="mt-4">
                    <DialogClose asChild>
                        <Button variant="outline">{t("cancel")}</Button>
                    </DialogClose>
                    <Button onClick={onConfirm} disabled={isSaving}>
                        {isSaving ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {isNewWorkflow ? t("saving") : t("executing")}
                            </>
                        ) : isNewWorkflow ? (
                            t("saveAndExecute")
                        ) : (
                            t("confirmExecute")
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
