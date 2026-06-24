/**
 * JSON repair/parse utility.
 *
 * LLM responses (especially with maxOutputTokens limit) often get truncated
 * mid-string or mid-object. Direct JSON.parse fails in these cases. This util:
 *
 *   1. Strips markdown code fences if present
 *   2. Tries direct JSON.parse
 *   3. On failure, attempts a structural repair:
 *      - trim to last safe position before an incomplete value
 *      - close any open strings
 *      - close any open braces/brackets
 *   4. Returns null if still unparseable
 */

function stripFences(s: string): string {
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1];
  return s.replace(/^```json?\s*/i, "").replace(/```\s*$/, "");
}

export function repairTruncatedJson(raw: string): string | null {
  if (!raw) return null;
  const firstBrace = raw.indexOf("{");
  if (firstBrace === -1) return null;
  const s = raw.slice(firstBrace);

  const stack: string[] = [];
  let inString = false;
  let escape = false;
  let lastCommaIdx = -1;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (inString) {
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}") {
      if (stack[stack.length - 1] === "{") stack.pop();
    } else if (c === "]") {
      if (stack[stack.length - 1] === "[") stack.pop();
    } else if (c === "," && stack.length > 0) {
      lastCommaIdx = i;
    }
  }

  if (stack.length === 0 && !inString) return s;

  // Trim to last safe cut (before an incomplete value)
  const cut = lastCommaIdx > 0 ? lastCommaIdx : s.length;
  let trimmed = s.slice(0, cut);

  // Re-scan trimmed portion to rebuild close sequence
  const stack2: string[] = [];
  let inStr2 = false;
  let esc2 = false;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (esc2) {
      esc2 = false;
      continue;
    }
    if (c === "\\") {
      esc2 = true;
      continue;
    }
    if (inStr2) {
      if (c === '"') inStr2 = false;
      continue;
    }
    if (c === '"') {
      inStr2 = true;
      continue;
    }
    if (c === "{" || c === "[") stack2.push(c);
    else if (c === "}") {
      if (stack2[stack2.length - 1] === "{") stack2.pop();
    } else if (c === "]") {
      if (stack2[stack2.length - 1] === "[") stack2.pop();
    }
  }

  trimmed = trimmed.replace(/,\s*$/, "");
  if (inStr2) trimmed += '"';
  while (stack2.length > 0) {
    const open = stack2.pop();
    trimmed += open === "{" ? "}" : "]";
  }
  return trimmed;
}

/**
 * Robustly parse an LLM JSON response. Returns null if unparseable.
 *
 * Strategy: direct parse → fence strip → brace extraction → structural repair.
 */
export function safeParseJson<T = any>(raw: string): T | null {
  if (!raw) return null;

  // 1. Direct
  try {
    return JSON.parse(raw) as T;
  } catch {}

  // 2. Strip fences
  const stripped = stripFences(raw);
  try {
    return JSON.parse(stripped) as T;
  } catch {}

  // 3. Extract first { to last } (greedy)
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(stripped.slice(firstBrace, lastBrace + 1)) as T;
    } catch {}
  }

  // 4. Repair truncated
  const repaired = repairTruncatedJson(stripped);
  if (repaired) {
    try {
      return JSON.parse(repaired) as T;
    } catch {}
  }

  return null;
}
