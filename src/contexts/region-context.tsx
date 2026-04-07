"use client";

/**
 * Region Context
 * Provides region information throughout the app for CN vs International users
 */

import { createContext, useContext, type ReactNode } from "react";
import type { RegionType } from "@/lib/region-utils";

interface RegionContextValue {
    region: RegionType;
}

const RegionContext = createContext<RegionContextValue>({ region: "intl" });

export function RegionProvider({
    children,
    region,
}: {
    children: ReactNode;
    region: RegionType;
}) {
    return (
        <RegionContext.Provider value={{ region }}>
            {children}
        </RegionContext.Provider>
    );
}

export function useRegion(): RegionType {
    const context = useContext(RegionContext);
    return context.region;
}
