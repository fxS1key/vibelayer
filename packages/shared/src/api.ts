import { z } from 'zod';
import { GeneratedPatchSchema } from './patch.js';

// DOM snapshot is a sanitized, trimmed HTML string. The extension is responsible
// for stripping PII before sending — see extension/src/content.ts. We cap size
// here as a defense in depth: oversized snapshots are rejected at the API edge.
export const DomSnapshotSchema = z.object({
  url: z.string().url(),
  domain: z.string(),
  title: z.string().max(500),
  html: z.string().max(120_000),
  viewport: z.object({ width: z.number().int(), height: z.number().int() }),
  capturedAt: z.string().datetime(),
});
export type DomSnapshot = z.infer<typeof DomSnapshotSchema>;

export const GenerateRequestSchema = z.object({
  prompt: z.string().min(3).max(2000),
  snapshot: DomSnapshotSchema,
  // BYOK: if provided, the server proxies to the user's own key and skips
  // billing the user's VibeLayer balance. Never logged.
  byokKey: z.string().optional(),
  byokProvider: z.enum(['anthropic', 'openai']).optional(),
  model: z.string().optional(),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export const GenerateResponseSchema = z.object({
  patch: GeneratedPatchSchema,
  tokensUsed: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  model: z.string(),
  cached: z.boolean().default(false),
});
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;

export const TokenEstimateSchema = z.object({
  estimatedTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
});
export type TokenEstimate = z.infer<typeof TokenEstimateSchema>;
