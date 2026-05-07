"use client";

import { Masonry } from "masonic";
import * as React from "react";

/**
 * Render function type for the waterfall component
 */
export interface WaterfallRenderProps {
    index: number;
    data: any;
    width: number;
}

/**
 * Props type for the waterfall component
 */
export interface WaterfallProps {
    /** Data source array */
    items: any[];

    /** Component used to render each item */
    render: React.ComponentType<WaterfallRenderProps>;

    /** Column width (minimum value), in pixels, defaults to 240px */
    columnWidth?: number;

    /** Column gutter, in pixels, defaults to 0px */
    columnGutter?: number;

    /** Row gutter, in pixels, defaults to columnGutter */
    rowGutter?: number;

    /** Maximum number of columns */
    maxColumnCount?: number;

    /** Maximum column width */
    maxColumnWidth?: number;

    /** Container className */
    className?: string;

    /** Container style */
    style?: React.CSSProperties;

    /** Estimated item height for initial render optimization, defaults to 300px */
    itemHeightEstimate?: number;

    /** Callback when items are rendered */
    onRender?: (startIndex: number, stopIndex: number, items: any[]) => void;

    /** Get the unique key for each item, defaults to returning the index */
    itemKey?: (data: any, index: number) => string | number;
}

/**
 * Waterfall component
 * A high-performance virtualized waterfall layout component based on the masonic library
 *
 * @example
 * ```tsx
 * <Waterfall
 *   items={items}
 *   render={MasonryCard}
 *   columnWidth={240}
 *   columnGutter={16}
 *   rowGutter={16}
 * />
 * ```
 */
export const Waterfall = React.forwardRef<HTMLDivElement, WaterfallProps>(
    (
        {
            items,
            render: RenderComponent,
            columnWidth = 240,
            columnGutter = 0,
            rowGutter = columnGutter,
            maxColumnCount,
            maxColumnWidth,
            className,
            style,
            itemHeightEstimate = 300,
            onRender,
            itemKey,
        },
        ref,
    ) => {
        return (
            <div ref={ref} className={className} style={style}>
                <Masonry
                    items={items}
                    render={RenderComponent}
                    columnWidth={columnWidth}
                    columnGutter={columnGutter}
                    rowGutter={rowGutter}
                    maxColumnCount={maxColumnCount}
                    maxColumnWidth={maxColumnWidth}
                    itemHeightEstimate={itemHeightEstimate}
                    onRender={onRender}
                    itemKey={itemKey}
                />
            </div>
        );
    },
);

Waterfall.displayName = "Waterfall";

export default Waterfall;
