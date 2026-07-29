export interface ComplianceRule {
  readonly category: string;
  readonly replacement: string;
  readonly severity: "block" | "warn";
  readonly term: string;
}

export interface ComplianceHit extends ComplianceRule {
  readonly end: number;
  readonly start: number;
}

export interface ComplianceReport {
  readonly blocked: boolean;
  readonly hits: readonly ComplianceHit[];
}

/**
 * Pure, vertical-agnostic content validation. Callers supply the lexicon;
 * the module has no knowledge of industries, Skills, providers, or storage.
 */
export function validateContent(
  content: string,
  rules: readonly ComplianceRule[],
): ComplianceReport {
  const hits: ComplianceHit[] = [];

  for (const rule of rules) {
    if (!rule.term) continue;
    let start = 0;
    while (start < content.length) {
      const index = content.indexOf(rule.term, start);
      if (index < 0) break;
      hits.push({
        ...rule,
        end: index + rule.term.length,
        start: index,
      });
      start = index + Math.max(rule.term.length, 1);
    }
  }

  hits.sort((left, right) => left.start - right.start || left.end - right.end);
  return {
    // Every configured lexicon hit requires review before publishing. Severity
    // remains useful for UI emphasis and future policy, but never means "safe".
    blocked: hits.length > 0,
    hits,
  };
}

export function applyComplianceReplacements(
  content: string,
  hits: readonly ComplianceHit[],
): string {
  const replacements = new Map(
    hits
      .filter((hit) => hit.replacement)
      .map((hit) => [hit.term, hit.replacement]),
  );
  let revised = content;
  for (const [term, replacement] of replacements) {
    revised = revised.split(term).join(replacement);
  }
  return revised;
}
