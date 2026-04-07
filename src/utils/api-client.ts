import toast from "react-hot-toast";

/**
 * 登录页面路径
 */
const LOGIN_PATH = "/login";

/**
 * 处理认证错误（401/403），跳转到登录页面
 */
function handleAuthError(status: number): void {
    // 只在客户端执行跳转
    if (typeof window !== "undefined") {
        const currentPath = window.location.pathname;
        // 避免在登录页面重复跳转
        if (currentPath !== LOGIN_PATH && currentPath !== "/signup") {
            // 保存当前页面路径，登录后可以跳转回来
            const redirectUrl = encodeURIComponent(window.location.href);
            window.location.href = `${LOGIN_PATH}?redirect=${redirectUrl}`;
        }
    }
}

/**
 * API 响应类型
 */
interface ApiResponse<T = unknown> {
    success?: boolean;
    error?: string;
    message?: string;
    data?: T;
    [key: string]: unknown;
}

/**
 * 请求配置选项
 */
interface FetchOptions extends Omit<RequestInit, "body"> {
    /**
     * 是否显示错误 toast，默认为 true
     */
    showErrorToast?: boolean;
    /**
     * 是否显示成功 toast，默认为 false
     */
    showSuccessToast?: boolean;
    /**
     * 自定义成功消息
     */
    successMessage?: string;
    /**
     * 自定义错误消息
     */
    errorMessage?: string;
    /**
     * 是否自动解析 JSON，默认为 true
     */
    parseJson?: boolean;
    /**
     * 响应超时时间（毫秒），默认为 30000
     */
    timeout?: number;
    /**
     * 是否在 401/403 错误时自动跳转到登录页面，默认为 true
     */
    redirectOnAuthError?: boolean;
}

/**
 * 获取错误消息
 */
function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as Record<string, unknown>).message === "string"
    ) {
        return (error as Record<string, unknown>).message as string;
    }
    return "未知错误";
}

/**
 * 提取 API 响应中的错误信息
 * 优先级：error > errorMessage > message
 */
function extractErrorFromResponse(data: unknown): string | null {
    if (typeof data !== "object" || data === null) {
        return null;
    }

    const response = data as Record<string, unknown>;

    // 尝试从常见的错误字段中提取错误信息（按优先级）
    // 1. error 字段（常见的错误格式）
    if (typeof response.error === "string" && response.error.trim()) {
        return response.error.trim();
    }

    // 2. errorMessage 字段
    if (
        typeof response.errorMessage === "string" &&
        response.errorMessage.trim()
    ) {
        return response.errorMessage.trim();
    }

    // 3. message 字段（仅当明确表示错误时）
    if (
        typeof response.message === "string" &&
        response.message.trim() &&
        !response.success
    ) {
        return response.message.trim();
    }

    return null;
}

/**
 * 统一的 fetch 包装函数
 *
 * @example
 * // 简单的 GET 请求
 * const data = await apiClient('/api/users');
 *
 * @example
 * // POST 请求并显示成功消息
 * const result = await apiClient('/api/users', {
 *   method: 'POST',
 *   body: JSON.stringify({ name: 'John' }),
 *   showSuccessToast: true,
 *   successMessage: '创建成功！',
 * });
 *
 * @example
 * // 自定义错误处理
 * const data = await apiClient('/api/users', {
 *   errorMessage: '加载用户失败',
 * });
 */
export async function apiClient<T = unknown>(
    url: string,
    options: FetchOptions = {},
): Promise<T> {
    const {
        showErrorToast = true,
        showSuccessToast = false,
        successMessage,
        errorMessage,
        parseJson = true,
        timeout = 30000,
        redirectOnAuthError = true,
        ...fetchOptions
    } = options;

    let errorToastShown = false; // 追踪是否已显示错误 toast

    try {
        // 创建带超时的 fetch 请求
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        let response: Response;
        try {
            response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeoutId);
        }

        // 处理响应
        let data: unknown;
        if (parseJson) {
            try {
                data = await response.json();
            } catch {
                data = null;
            }
        } else {
            data = await response.text();
        }

        // 检查 HTTP 状态
        if (!response.ok) {
            // 处理认证错误：401（未认证）和 403（无权限）
            if (response.status === 401 || response.status === 403) {
                // 401/403 错误 - 跳转到登录页
                if (redirectOnAuthError) {
                    handleAuthError(response.status);
                }
                // 仍然抛出错误，但可能页面会跳转
                const authErrorMsg =
                    response.status === 401
                        ? "登录已过期，请重新登录"
                        : "您没有权限访问此资源";
                if (showErrorToast) {
                    toast.error(authErrorMsg);
                    errorToastShown = true;
                }
                const error = new Error(authErrorMsg);
                (error as Error & { status?: number }).status = response.status;
                throw error;
            }

            // 优先级：自定义错误消息 > 后端返回的错误 > 默认错误消息
            const backendError = extractErrorFromResponse(data);
            const errorMsg =
                errorMessage ||
                backendError ||
                `请求失败: ${response.status} ${response.statusText}`;

            if (showErrorToast) {
                // 后端错误信息自动显示到 toast
                toast.error(errorMsg);
                errorToastShown = true; // 标记已显示
            }

            const error = new Error(errorMsg);
            (error as Error & { status?: number }).status = response.status;
            throw error;
        }

        // 显示成功消息
        if (showSuccessToast) {
            const message = successMessage || "操作成功";
            toast.success(message);
        }

        return data as T;
    } catch (error) {
        // 处理网络错误和其他错误
        if (error instanceof Error && error.name === "AbortError") {
            const msg = errorMessage || "请求超时，请重试";
            if (showErrorToast && !errorToastShown) {
                toast.error(msg);
                errorToastShown = true;
            }
            throw new Error(msg);
        }

        // 如果已经显示过错误 toast，就直接抛出，不再显示
        if (errorToastShown) {
            throw error;
        }

        // 显示通用错误消息（仅当还未显示过 toast 时）
        const msg = errorMessage || getErrorMessage(error);
        if (showErrorToast) {
            toast.error(msg);
        }

        throw error;
    }
}

/**
 * 便捷方法：GET 请求
 */
export async function apiGet<T = unknown>(
    url: string,
    options: Omit<FetchOptions, "method" | "body"> = {},
): Promise<T> {
    return apiClient<T>(url, {
        ...options,
        method: "GET",
    });
}

/**
 * 便捷方法：POST 请求
 */
export async function apiPost<T = unknown>(
    url: string,
    body?: unknown,
    options: Omit<FetchOptions, "method"> = {},
): Promise<T> {
    return apiClient<T>(url, {
        ...options,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
    } as RequestInit & FetchOptions);
}

/**
 * 便捷方法：PUT 请求
 */
export async function apiPut<T = unknown>(
    url: string,
    body?: unknown,
    options: Omit<FetchOptions, "method"> = {},
): Promise<T> {
    return apiClient<T>(url, {
        ...options,
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
    } as RequestInit & FetchOptions);
}

/**
 * 便捷方法：DELETE 请求
 */
export async function apiDelete<T = unknown>(
    url: string,
    options: Omit<FetchOptions, "method"> = {},
): Promise<T> {
    return apiClient<T>(url, {
        ...options,
        method: "DELETE",
    });
}

/**
 * 便捷方法：PATCH 请求
 */
export async function apiPatch<T = unknown>(
    url: string,
    body?: unknown,
    options: Omit<FetchOptions, "method"> = {},
): Promise<T> {
    return apiClient<T>(url, {
        ...options,
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
    } as RequestInit & FetchOptions);
}
