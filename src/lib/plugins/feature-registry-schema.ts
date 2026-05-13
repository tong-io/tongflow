import { z } from "zod";

export interface FeatureDefinition {
    name: string;
    type: string;
    function: string;
}

const FeatureDefinitionSchema = z.object({
    name: z.string().min(1).max(256),
    type: z.string().min(1).max(64),
    function: z.string().min(1).max(512),
});

const AliasesSchema = z.object({
    canonical: z.record(z.string(), z.string()).default({}),
    labelLookup: z.record(z.string(), z.string()).default({}),
});

export const FeatureRegistryBundleSchema = z.object({
    $schema: z.string().optional(),
    features: z.array(FeatureDefinitionSchema),
    aliases: AliasesSchema.default({ canonical: {}, labelLookup: {} }),
});

export type FeatureRegistryBundle = z.infer<typeof FeatureRegistryBundleSchema>;

export function validateFeatureRegistryBundle(
    raw: unknown,
): FeatureRegistryBundle {
    return FeatureRegistryBundleSchema.parse(raw);
}
