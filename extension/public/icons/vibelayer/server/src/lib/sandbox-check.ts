// Static safety pass over a generated patch. Cheap, fast, run before the
// model-based validator (which costs tokens). Catches the obvious cases; the
// model handles obfuscation.

const FORBIDDEN_JS_TOKENS = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bsendBeacon\b/,
  /\bdocument\s*\.\s*cookie\b/,
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\bimportScripts\s*\(/,
  /\bimport\s*\(/,
  /\bnavigator\s*\.\s*sendBeacon\b/,
];

const FORBIDDEN_CSS_PATTERNS = [
  /@import\s+url\(/i,
  /url\(\s*['"]?https?:/i, // external resource load
];

export interface StaticCheckResult {
  safe: boolean;
  reasons: string[];
}

export function staticCheck(patch: { css: string; js: string }): StaticCheckResult {
  const reasons: string[] = [];
  for (const re of FORBIDDEN_JS_TOKENS) {
    if (re.test(patch.js)) reasons.push(`JS matches forbidden pattern: ${re}`);
  }
  for (const re of FORBIDDEN_CSS_PATTERNS) {
    if (re.test(patch.css)) reasons.push(`CSS matches forbidden pattern: ${re}`);
  }
  // localStorage writes outside the vibelayer: namespace.
  const lsWrites = patch.js.match(/localStorage\s*\.\s*setItem\s*\(\s*['"]([^'"]+)['"]/g) ?? [];
  for (const m of lsWrites) {
    if (!m.includes("'vibelayer:") && !m.includes('"vibelayer:')) {
      reasons.push('JS writes to localStorage outside the vibelayer: namespace');
    }
  }
  return { safe: reasons.length === 0, reasons };
}
