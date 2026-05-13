/**
 * Per-node ABI registration: stores `feature` + `sourceSpec` keyed by the
 * React Flow `nodeId`. Single source of truth for the exporter and the
 * connection validator (both read `resolveSpec(feature, sourceSpec)`).
 */

import type { NodeSlot } from "@/generated/abi";
import type { AnySourceSpec } from "./sources";

export interface AbiNodeRegistration {
    /** RF node id; primary key. */
    nodeId: string;
    /** ABI feature slot (e.g. "image-gen-text"). */
    feature: NodeSlot;
    /** Per-field overrides (defaults apply where absent). */
    sourceSpec: AnySourceSpec;
    /** Optional label/title for workflow exports. */
    label?: string;
}

const registry = new Map<string, AbiNodeRegistration>();

export function registerAbiNode(reg: AbiNodeRegistration): void {
    registry.set(reg.nodeId, reg);
}

export function unregisterAbiNode(nodeId: string): void {
    registry.delete(nodeId);
}

export function getAbiNodeRegistration(
    nodeId: string,
): AbiNodeRegistration | undefined {
    return registry.get(nodeId);
}

export function hasAbiNodeRegistration(nodeId: string): boolean {
    return registry.has(nodeId);
}

export function getAllAbiNodeRegistrations(): ReadonlyMap<
    string,
    AbiNodeRegistration
> {
    return registry;
}
