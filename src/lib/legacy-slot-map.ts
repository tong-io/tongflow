/**
 * Slot normalization: snake_case → kebab-case only when the result is a known ABI node slot.
 */

import { ABI_NODES } from "@/generated/abi";

export function canonicalizeNodeSlot(slot: string): string {
    const t = slot.trim();
    if (!t || Object.hasOwn(ABI_NODES, t)) return t;
    const k = t.replace(/_/g, "-");
    return Object.hasOwn(ABI_NODES, k) ? k : t;
}
