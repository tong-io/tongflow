/**
 * Upload limit configuration
 */

export interface ValidationResult {
    allowed: boolean;
    message?: string;
    maxAllowed?: number;
}
