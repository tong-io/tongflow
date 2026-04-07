/**
 * 日期工具函数
 * 处理数据库中可能存在的秒级或毫秒级时间戳
 */

/**
 * 安全地将时间戳转换为 Date 对象
 * 处理以下情况：
 * 1. 已经是 Date 对象
 * 2. ISO 日期字符串
 * 3. 秒级时间戳（正确的数据库格式）
 * 4. 毫秒级时间戳（错误存储的数据）
 *
 * @param value - 时间戳值（可以是 Date、string 或 number）
 * @returns Date 对象
 */
export function toSafeDate(
    value: Date | string | number | null | undefined,
): Date {
    if (!value) {
        return new Date();
    }

    // 已经是 Date 对象
    if (value instanceof Date) {
        // 检查是否是异常日期（年份 > 3000）
        if (value.getFullYear() > 3000) {
            // 可能是毫秒时间戳被当作秒处理了，需要修正
            // Drizzle 的 timestamp 模式会把秒数乘以1000，所以这里要除以1000再转换
            const correctedMs = value.getTime() / 1000;
            return new Date(correctedMs);
        }
        return value;
    }

    // 字符串类型
    if (typeof value === "string") {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
            return toSafeDate(date); // 递归检查结果
        }
        return new Date();
    }

    // 数字类型
    if (typeof value === "number") {
        // 判断是秒级还是毫秒级时间戳
        // 秒级时间戳通常小于 10^10（2001年之后的秒级时间戳约为 10^9）
        // 毫秒级时间戳通常大于 10^12（2001年之后的毫秒级时间戳约为 10^12）
        if (value > 1e11) {
            // 毫秒级时间戳
            return new Date(value);
        } else {
            // 秒级时间戳
            return new Date(value * 1000);
        }
    }

    return new Date();
}

/**
 * 格式化日期为本地日期字符串
 *
 * @param value - 时间戳值
 * @param locale - 语言环境，默认自动检测
 * @returns 格式化后的日期字符串
 */
export function formatDate(
    value: Date | string | number | null | undefined,
    locale?: string,
): string {
    const date = toSafeDate(value);
    return date.toLocaleDateString(locale);
}

/**
 * 格式化日期时间为本地日期时间字符串
 *
 * @param value - 时间戳值
 * @param locale - 语言环境，默认自动检测
 * @returns 格式化后的日期时间字符串
 */
export function formatDateTime(
    value: Date | string | number | null | undefined,
    locale?: string,
): string {
    const date = toSafeDate(value);
    return date.toLocaleString(locale);
}
