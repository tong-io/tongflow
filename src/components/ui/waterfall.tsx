"use client";

import * as React from "react";
import { Masonry } from "masonic";

/**
 * 瀑布流组件的渲染函数类型
 */
export interface WaterfallRenderProps {
    index: number;
    data: any;
    width: number;
}

/**
 * 瀑布流组件的 Props 类型
 */
export interface WaterfallProps {
    /** 数据源数组 */
    items: any[];

    /** 渲染每个项的组件 */
    render: React.ComponentType<WaterfallRenderProps>;

    /** 列宽度（最小值），单位为像素，默认 240px */
    columnWidth?: number;

    /** 列间距，单位为像素，默认 0px */
    columnGutter?: number;

    /** 行间距，单位为像素，默认等于 columnGutter */
    rowGutter?: number;

    /** 最大列数 */
    maxColumnCount?: number;

    /** 最大列宽 */
    maxColumnWidth?: number;

    /** 容器的 className */
    className?: string;

    /** 容器的 style */
    style?: React.CSSProperties;

    /** 项的高度预估值，用于初始渲染优化，默认 300px */
    itemHeightEstimate?: number;

    /** 渲染时的回调 */
    onRender?: (startIndex: number, stopIndex: number, items: any[]) => void;

    /** 获取项的唯一 key，默认返回 index */
    itemKey?: (data: any, index: number) => string | number;
}

/**
 * 瀑布流组件
 * 基于 masonic 库的高性能虚拟化瀑布流组件
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
