/**
 * Upload limit configuration
 * Credit recharge model; all users share the same limits
 */

// ============================================================================
// Validation result type
// ============================================================================

export interface ValidationResult {
    allowed: boolean;
    message?: string;
    maxAllowed?: number;
    requiredTier?: string;
}
