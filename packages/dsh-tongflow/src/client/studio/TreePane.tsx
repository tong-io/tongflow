import { useState } from "react";
import type { TreeNode } from "tongflow-studio/shared";

const ICONS: Record<TreeNode["kind"], string> = {
    folder: "📁",
    file: "📄",
    workflow: "🧩",
    output: "🖼",
};

function iconFor(node: TreeNode): string {
    const m = node.meta?.modality;
    if (node.kind === "file" || node.kind === "output") {
        if (m === "image") return "🖼";
        if (m === "video") return "🎞";
        if (m === "audio") return "🔊";
        if (m === "model") return "◈";
        if (m === "text") return "📝";
    }
    return ICONS[node.kind];
}

function Row({
    node,
    depth,
    selectedId,
    onSelect,
    defaultOpen,
}: {
    node: TreeNode;
    depth: number;
    selectedId?: string;
    onSelect: (n: TreeNode) => void;
    defaultOpen: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const hasChildren = (node.children?.length ?? 0) > 0;
    return (
        <div>
            <div
                className={`tfs-tree-row${selectedId === node.id ? " selected" : ""}`}
                style={{ paddingLeft: 8 + depth * 14 }}
                onClick={() => {
                    // Selecting a row opens it; a second click on the selected row toggles.
                    if (hasChildren)
                        setOpen((o) => (selectedId === node.id ? !o : true));
                    onSelect(node);
                }}
            >
                <span
                    className="tfs-tree-caret"
                    onClick={(e) => {
                        if (!hasChildren) return;
                        e.stopPropagation();
                        setOpen((o) => !o);
                    }}
                >
                    {hasChildren ? (open ? "▾" : "▸") : ""}
                </span>
                <span className="tfs-tree-icon">{iconFor(node)}</span>
                <span className="tfs-tree-label">{node.label}</span>
                {node.kind === "workflow" && node.meta?.outputCount ? (
                    <span className="tfs-badge">{node.meta.outputCount}</span>
                ) : null}
                {node.kind === "folder" && hasChildren ? (
                    <span className="tfs-badge">{node.children!.length}</span>
                ) : null}
            </div>
            {open && hasChildren
                ? node.children!.map((c) => (
                      <Row
                          key={c.id}
                          node={c}
                          depth={depth + 1}
                          selectedId={selectedId}
                          onSelect={onSelect}
                          defaultOpen={c.kind === "workflow" || depth < 1}
                      />
                  ))
                : null}
        </div>
    );
}

export function TreePane({
    tree,
    selectedId,
    onSelect,
}: {
    tree: TreeNode[];
    selectedId?: string;
    onSelect: (n: TreeNode) => void;
}) {
    return (
        <div className="tfs-tree">
            {tree.map((n) => (
                <Row
                    key={n.id}
                    node={n}
                    depth={0}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    defaultOpen
                />
            ))}
        </div>
    );
}
