import { Slot } from "@radix-ui/react-slot";
import type { Edge } from "@xyflow/react";
import { useNodeId, useReactFlow, useStore } from "@xyflow/react";
import {
    CheckCircle,
    Circle,
    Eye,
    Layers,
    Lock,
    MenuIcon,
    MessageSquare,
    Play,
    Trash,
    Trash2,
    Unlock,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef, useCallback, useMemo, useState } from "react";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import useFlow from "@/hooks/use-flow";
import { cn } from "@/lib/utils";
import { coerceBaseNodeData } from "@/lib/workflow/flow-node-data";

/**
 * Recursively collect all downstream node IDs starting from a given node.
 */
function getDescendantNodeIds(nodeId: string, edges: Edge[]): Set<string> {
    const descendants = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
        const current = queue.shift()!;
        for (const edge of edges) {
            if (edge.source === current && !descendants.has(edge.target)) {
                descendants.add(edge.target);
                queue.push(edge.target);
            }
        }
    }
    return descendants;
}

/* NODE HEADER -------------------------------------------------------------- */

export type NodeHeaderProps = HTMLAttributes<HTMLElement>;

/**
 * A container for a consistent header layout intended to be used inside the
 * `<BaseNodeShell />` component.
 */
export const NodeHeader = forwardRef<HTMLElement, NodeHeaderProps>(
    ({ className, ...props }, ref) => {
        return (
            <header
                ref={ref}
                {...props}
                className={cn(
                    "flex items-center justify-between gap-2 px-3 py-2",
                    className,
                )}
            />
        );
    },
);

NodeHeader.displayName = "NodeHeader";

/* NODE HEADER TITLE -------------------------------------------------------- */

export type NodeHeaderTitleProps = HTMLAttributes<HTMLHeadingElement> & {
    asChild?: boolean;
};

/**
 * The title text for the node. To maintain a native application feel, the title
 * text is not selectable.
 */
export const NodeHeaderTitle = forwardRef<
    HTMLHeadingElement,
    NodeHeaderTitleProps
>(({ className, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "h3";

    return (
        <Comp
            ref={ref}
            {...props}
            className={cn(className, "select-none flex-1 font-semibold")}
        />
    );
});

NodeHeaderTitle.displayName = "NodeHeaderTitle";

/* NODE HEADER ICON --------------------------------------------------------- */

export type NodeHeaderIconProps = HTMLAttributes<HTMLSpanElement>;

export const NodeHeaderIcon = forwardRef<HTMLSpanElement, NodeHeaderIconProps>(
    ({ className, ...props }, ref) => {
        return (
            <span
                ref={ref}
                {...props}
                className={cn(className, "[&>*]:size-5")}
            />
        );
    },
);

NodeHeaderIcon.displayName = "NodeHeaderIcon";

/* NODE HEADER ACTIONS ------------------------------------------------------ */

export type NodeHeaderActionsProps = HTMLAttributes<HTMLDivElement>;

/**
 * A container for right-aligned action buttons in the node header.
 */
export const NodeHeaderActions = forwardRef<
    HTMLDivElement,
    NodeHeaderActionsProps
>(({ className, ...props }, ref) => {
    return (
        <div
            ref={ref}
            {...props}
            className={cn(
                "ml-auto flex items-center gap-1 justify-self-end",
                className,
            )}
        />
    );
});

NodeHeaderActions.displayName = "NodeHeaderActions";

/* NODE HEADER ACTION ------------------------------------------------------- */

export type NodeHeaderActionProps = React.ComponentProps<typeof Button> & {
    label: string;
};

/**
 * A thin wrapper around the `<Button />` component with a fixed sized suitable
 * for icons.
 *
 * Because the `<NodeHeaderAction />` component is intended to render icons, it's
 * important to provide a meaningful and accessible `label` prop that describes
 * the action.
 */
export const NodeHeaderAction = forwardRef<
    HTMLButtonElement,
    NodeHeaderActionProps
>(({ className, label, title, ...props }, ref) => {
    return (
        <Button
            ref={ref}
            variant="ghost"
            aria-label={label}
            title={title ?? label}
            className={cn(className, "nodrag size-6 p-1")}
            {...props}
        />
    );
});

NodeHeaderAction.displayName = "NodeHeaderAction";

/* NODE HEADER MENU ACTION -------------------------------------------------- */

export type NodeHeaderMenuActionProps = Omit<
    NodeHeaderActionProps,
    "onClick"
> & {
    trigger?: ReactNode;
    showDelete?: boolean;
    showComment?: boolean;
};

/**
 * Renders a header action that opens a dropdown menu when clicked. The dropdown
 * trigger is a button with a menu icon. The trigger's content can be changed
 * by using the `trigger` prop.
 *
 * Any children passed to the `<NodeHeaderMenuAction />` component will be rendered
 * inside the dropdown menu. By default, a delete action and comment action are
 * automatically included. Set `showDelete={false}` or `showComment={false}` to hide them.
 */
export const NodeHeaderMenuAction = forwardRef<
    HTMLButtonElement,
    NodeHeaderMenuActionProps
>(
    (
        { trigger, children, showDelete = true, showComment = true, ...props },
        ref,
    ) => {
        const id = useNodeId();
        const { updateNodeData } = useReactFlow();
        const edges = useFlow((s) => s.edges);
        const t = useTranslations("Workspace.nodes.base");
        const [showDeleteDialog, setShowDeleteDialog] = useState(false);

        // Get current node's comment from store
        const comment = useStore(
            useCallback(
                (state) => {
                    const node = state.nodeLookup.get(id ?? "");
                    return coerceBaseNodeData(node?.data).comment;
                },
                [id],
            ),
        );

        // Count descendant nodes for display
        const descendantCount = useMemo(() => {
            if (!id) return 0;
            return getDescendantNodeIds(id, edges).size;
        }, [id, edges]);

        // Delete lone node mirroring Flow store plus dangling edges
        const handleDeleteNode = useCallback(() => {
            if (!id) return;
            useFlow.getState().removeNode(id);
            setShowDeleteDialog(false);
        }, [id]);

        // Delete this node and all descendants
        const handleDeleteNodeAndChildren = useCallback(() => {
            if (!id) return;
            const {
                edges: curEdges,
                nodes,
                setNodes,
                setEdges,
            } = useFlow.getState();
            const descendants = getDescendantNodeIds(id, curEdges);
            const toRemove = new Set([id, ...descendants]);
            setNodes(nodes.filter((node) => !toRemove.has(node.id)));
            setEdges(
                curEdges.filter(
                    (edge) =>
                        !toRemove.has(edge.source) &&
                        !toRemove.has(edge.target),
                ),
            );
            setShowDeleteDialog(false);
        }, [id]);

        // Delete only descendants
        const handleDeleteChildren = useCallback(() => {
            if (!id) return;
            const {
                edges: curEdges,
                nodes,
                setNodes,
                setEdges,
            } = useFlow.getState();
            const descendants = getDescendantNodeIds(id, curEdges);
            setNodes(nodes.filter((node) => !descendants.has(node.id)));
            setEdges(
                curEdges.filter(
                    (edge) =>
                        !descendants.has(edge.source) &&
                        !descendants.has(edge.target),
                ),
            );
            setShowDeleteDialog(false);
        }, [id]);

        const handleToggleComment = useCallback(() => {
            if (!id) return;
            if (comment === undefined) {
                updateNodeData(id, { comment: "" });
            }
        }, [id, comment, updateNodeData]);

        const hasComment = comment !== undefined;

        return (
            <>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <NodeHeaderAction ref={ref} {...props}>
                            {trigger ?? <MenuIcon />}
                        </NodeHeaderAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        {children}
                        {showComment && !hasComment && (
                            <>
                                {children && <DropdownMenuSeparator />}
                                <DropdownMenuItem onClick={handleToggleComment}>
                                    <MessageSquare className="mr-2 h-4 w-4" />
                                    {t("addComment")}
                                </DropdownMenuItem>
                            </>
                        )}
                        {showDelete && (
                            <>
                                {(children || (showComment && !hasComment)) && (
                                    <DropdownMenuSeparator />
                                )}
                                <DropdownMenuItem
                                    onClick={() =>
                                        descendantCount > 0
                                            ? setShowDeleteDialog(true)
                                            : handleDeleteNode()
                                    }
                                >
                                    <Trash className="mr-2 h-4 w-4" />
                                    {t("delete")}
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Delete confirmation dialog - only shown when node has children */}
                <AlertDialog
                    open={showDeleteDialog}
                    onOpenChange={setShowDeleteDialog}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {t("deleteConfirmTitle")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {t("deleteConfirmDescription", {
                                    count: descendantCount,
                                })}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
                            <Button
                                variant="destructive"
                                onClick={handleDeleteNode}
                                className="w-full"
                            >
                                <Trash className="mr-2 h-4 w-4" />
                                {t("deleteNodeOnly")}
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleDeleteNodeAndChildren}
                                className="w-full"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t("deleteNodeAndChildren", {
                                    count: descendantCount,
                                })}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleDeleteChildren}
                                className="w-full"
                            >
                                <Trash className="mr-2 h-4 w-4" />
                                {t("deleteChildrenOnly", {
                                    count: descendantCount,
                                })}
                            </Button>
                            <AlertDialogCancel className="w-full mt-0">
                                {t("cancel")}
                            </AlertDialogCancel>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </>
        );
    },
);

NodeHeaderMenuAction.displayName = "NodeHeaderMenuAction";

/* NODE HEADER RUN ACTION --------------------------------------------------- */

export interface NodeHeaderRunActionProps {
    onClick: () => void;
}

export const NodeHeaderRunAction: React.FC<NodeHeaderRunActionProps> = ({
    onClick,
}) => {
    const t = useTranslations("Workspace.nodes.base");

    return (
        <div className="flex items-center gap-2">
            <NodeHeaderAction
                onClick={onClick}
                variant="ghost"
                label={t("run")}
            >
                <Play />
            </NodeHeaderAction>
        </div>
    );
};

NodeHeaderRunAction.displayName = "NodeHeaderRunAction";

/* NODE HEADER COMBO ACTION ----------------------------------------- */

export interface NodeHeaderComboActionProps {
    onClick: () => void;
}

export const NodeHeaderComboAction: React.FC<NodeHeaderComboActionProps> = ({
    onClick,
}) => {
    const nodeId = useNodeId();

    // Subscribe primitives/functions only — avoid rerenders from collections
    const comboMode = useFlow((s) => s.comboMode);
    const isInCombo = useFlow((s) => (nodeId ? s.isInCombo(nodeId) : false));
    const toggleCombo = useFlow((s) => s.toggleCombo);
    const t = useTranslations("Workspace.nodes.base");

    const handleComboClick = useCallback(() => {
        if (!nodeId) return;
        toggleCombo(nodeId);
        onClick?.();
    }, [nodeId, toggleCombo, onClick]);

    return (
        <NodeHeaderAction
            onClick={handleComboClick}
            variant="ghost"
            label={
                comboMode
                    ? isInCombo
                        ? t("removeFromCombo")
                        : t("addToCombo")
                    : t("startCombo")
            }
            className={cn(
                "transition-all duration-200",
                !comboMode &&
                    "!size-8 !p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground",
                comboMode &&
                    isInCombo &&
                    "!size-8 !p-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
                comboMode &&
                    !isInCombo &&
                    "!size-8 !p-1.5 bg-background border-2 border-muted hover:border-primary hover:text-primary hover:bg-accent/50 text-muted-foreground",
            )}
        >
            {!comboMode && <Layers className="size-full" />}
            {comboMode && isInCombo && <CheckCircle className="size-full" />}
            {comboMode && !isInCombo && <Circle className="size-full" />}
        </NodeHeaderAction>
    );
};

NodeHeaderComboAction.displayName = "NodeHeaderComboAction";

/* NODE HEADER PREVIEW ACTION ----------------------------------------- */

export interface NodeHeaderPreviewActionProps {
    onClick: () => void;
}

export const NodeHeaderPreviewAction: React.FC<
    NodeHeaderPreviewActionProps
> = ({ onClick }) => {
    const t = useTranslations("Workspace.nodes.base");
    return (
        <NodeHeaderAction
            onClick={onClick}
            variant="ghost"
            label={t("preview")}
        >
            <Eye />
        </NodeHeaderAction>
    );
};

NodeHeaderPreviewAction.displayName = "NodeHeaderPreviewAction";

/* NODE HEADER LOCK ACTION ----------------------------------------- */

export interface NodeHeaderLockActionProps {
    locked: boolean;
    onToggle: () => void;
}

export const NodeHeaderLockAction: React.FC<NodeHeaderLockActionProps> = ({
    locked,
    onToggle,
}) => {
    const t = useTranslations("Workspace.nodes.base");
    return (
        <NodeHeaderAction
            onClick={onToggle}
            variant="ghost"
            label={locked ? t("unlock") : t("lock")}
            className={cn(locked && "text-amber-500")}
        >
            {locked ? <Lock className="fill-current" /> : <Unlock />}
        </NodeHeaderAction>
    );
};

NodeHeaderLockAction.displayName = "NodeHeaderLockAction";
