/**
 * Region utilities - simplified for open-source version.
 * Always returns 'intl' region.
 */

export type RegionType = "cn" | "intl";

export function getUserCountry(_headers: Headers): string | null {
    return null;
}

export function isMainlandChina(country: string | null): boolean {
    return country === "CN";
}

export function getRegion(_headers: Headers): RegionType {
    return "intl";
}
