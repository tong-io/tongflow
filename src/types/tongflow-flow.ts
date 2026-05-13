/**
 * Typed React Flow shapes for ABI-backed (“plugin”) canvas nodes.
 */

import type { Node, NodeProps } from "@xyflow/react";

import type { NodeSlot, SlotInput } from "@/generated/abi";
import type { BaseNodeData } from "@/types/nodes";

type TongflowPluginSharedFields<S extends NodeSlot> = {
    /** Slot key persisted on workflow snapshots / execution routing */
    feature: S;
    /** Slot input payload; `Partial` allows in-progress editing. */
    prompt?: Partial<SlotInput<S>>;
};

/**
 * @param Extra — per-node UI-only fields not covered by `BaseNodeData` /
 *   ABI `SlotInput` (e.g. a transient UI flag local to one node).
 */
export type TongflowPluginNodeData<
    S extends NodeSlot,
    Extra extends Record<string, unknown> = Record<string, never>,
> = BaseNodeData & TongflowPluginSharedFields<S> & Extra;

export type TongflowPluginNode<
    S extends NodeSlot,
    RFType extends string = string,
    Extra extends Record<string, unknown> = Record<string, never>,
> = Node<TongflowPluginNodeData<S, Extra>, RFType>;

export type TongflowPluginNodeProps<
    S extends NodeSlot,
    RFType extends string = string,
    Extra extends Record<string, unknown> = Record<string, never>,
> = NodeProps<TongflowPluginNode<S, RFType, Extra>>;
