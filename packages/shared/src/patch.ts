import { z } from 'zod';

// A Patch is the unit of personalization: CSS + (optional) sandboxed JS scoped
// to a domain. `version` is incremented locally and reconciled via vector clock
// on sync. `is_deleted` enables tombstones for cross-device delete propagation.
export const PatchSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().optional(),
  domain: z.string().min(1).max(253),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).default(''),
  css: z.string().default(''),
  js: z.string().default(''),
  affectedSelectors: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  version: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  isDeleted: z.boolean().default(false),
});
export type Patch = z.infer<typeof PatchSchema>;

// A LLM response shape — the generator MUST produce exactly this JSON object,
// nothing else. See server/src/prompts/generate-patch.ts for the contract.
export const GeneratedPatchSchema = z.object({
  css: z.string(),
  js: z.string(),
  description: z.string(),
  affectedSelectors: z.array(z.string()),
});
export type GeneratedPatch = z.infer<typeof GeneratedPatchSchema>;
