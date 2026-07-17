export type BrandLanguage = {
  tone: string;
  approvedPhrases: string[];
  avoidedPhrases: string[];
  motifs: string[];
  visualGrammar: string;
};

export const DEFAULT_BRAND_LANGUAGE: BrandLanguage = {
  tone: "Trustworthy documentary — optimistic but grounded, never sensational clickbait.",
  approvedPhrases: [],
  avoidedPhrases: ["SHOCKING", "YOU WON'T BELIEVE", "GONE WRONG"],
  motifs: [],
  visualGrammar:
    "Real camera language: 35mm lens, natural light, shallow depth of field, one dominant subject, phone-readable hook text.",
};

const STORAGE_KEY = "thumbnail-studio-brand-language";

export function loadBrandLanguage(): BrandLanguage {
  if (typeof window === "undefined") return { ...DEFAULT_BRAND_LANGUAGE };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BRAND_LANGUAGE };
    return { ...DEFAULT_BRAND_LANGUAGE, ...(JSON.parse(raw) as BrandLanguage) };
  } catch {
    return { ...DEFAULT_BRAND_LANGUAGE };
  }
}

export function saveBrandLanguage(language: BrandLanguage): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(language));
  } catch {
    // Ignore quota errors.
  }
}

export function brandLanguagePromptBlock(language: BrandLanguage): string {
  const lines = [
    "BRAND LANGUAGE (apply consistently to hook copy and visual direction):",
    `Tone: ${language.tone}`,
  ];
  if (language.approvedPhrases.length) {
    lines.push(`Preferred phrases / motifs: ${language.approvedPhrases.join("; ")}`);
  }
  if (language.avoidedPhrases.length) {
    lines.push(`Never use these phrases: ${language.avoidedPhrases.join("; ")}`);
  }
  if (language.motifs.length) {
    lines.push(`Recurring visual motifs: ${language.motifs.join(", ")}`);
  }
  if (language.visualGrammar.trim()) {
    lines.push(`Visual grammar: ${language.visualGrammar}`);
  }
  return lines.join("\n");
}

export function filterHooksWithBrandLanguage(hooks: string[], language: BrandLanguage): string[] {
  const blocked = language.avoidedPhrases.map((p) => p.toLowerCase().trim()).filter(Boolean);
  if (!blocked.length) return hooks;
  return hooks.filter((hook) => !blocked.some((phrase) => hook.toLowerCase().includes(phrase)));
}
