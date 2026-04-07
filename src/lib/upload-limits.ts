/**
 * 上传限制配置
 * 积分充值制，所有用户统一限制
 */

// ============================================================================
// 验证结果类型
// ============================================================================

export interface ValidationResult {
    allowed: boolean;
    message?: string;
    maxAllowed?: number;
    requiredTier?: string;
}
