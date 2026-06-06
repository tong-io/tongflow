/**
 * Reads a value from a flat object by path.
 * Supports array index notation: "fileKeys[0]" or plain fields: "texts".
 */
export function getValueByPath(
    obj: Record<string, unknown>,
    path: string,
): unknown {
    const arrayMatch = path.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
        const [, key, indexStr] = arrayMatch;
        const arr = obj[key];
        if (Array.isArray(arr)) {
            return arr[parseInt(indexStr, 10)];
        }
        return undefined;
    }
    return obj[path];
}
