import zh from "./locales/zh";
export const LANGUAGE_PREF_KEY = "cocodeai.language";

/**
 * Supported languages
 */
export type Language = "zh";
export type Locale = Language;

/**
 * All supported languages - single source of truth
 */
export const LANGUAGES: Language[] = ["zh"];

/**
 * Language options for UI - single source of truth
 */
export const LANGUAGE_OPTIONS = [
  { value: "zh" as Language, label: "简体中文", nativeName: "简体中文" },
] as const;

/**
 * Current translation strings use an English-style plural suffix placeholder.
 * Chinese does not have grammatical plural markers, so the suffix is always empty.
 */
export const pluralSuffix = (_locale: Language, _count: number): string => {
  return "";
};

/**
 * Translation maps
 */
const TRANSLATIONS: Record<Language, Record<string, string>> = {
  zh,
};

/**
 * Type guard to validate if a value is a Language
 */
export const isLanguage = (value: unknown): value is Language => {
  return value === "zh";
};

let localeValue: Language = "zh";

/**
 * Get current locale
 */
export const currentLocale = (): Language => locale();

function locale(): Language {
  return localeValue;
}

/**
 * Set locale and persist to localStorage
 */
export const setLocale = (newLocale: Language) => {
  if (!isLanguage(newLocale)) {
    console.warn(`Invalid locale: ${newLocale}, falling back to "zh"`);
    newLocale = "zh";
  }

  localeValue = newLocale;

  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", newLocale);
  }

  // Persist to localStorage
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LANGUAGE_PREF_KEY, newLocale);
    } catch (e) {
      console.warn("Failed to persist language preference:", e);
    }
  }
};

/**
 * Resolve a translation entry. Chinese only — returns the key itself as fallback.
 */
const lookupEntry = (loc: Language, candidateKey: string): string | null => {
  if (TRANSLATIONS[loc]?.[candidateKey]) return TRANSLATIONS[loc][candidateKey];
  return null;
};

const pluralRule = (_loc: Language, _count: number): Intl.LDMLPluralRule => {
  return "other";
};

/**
 * Pick the right key variant for a count. Chinese (no grammatical plural)
 * always uses the bare key.
 */
const resolvePluralKey = (loc: Language, key: string, count: number): string => {
  const candidates: string[] = [];
  if (count === 0) candidates.push(`${key}_zero`);
  candidates.push(`${key}_other`, key);

  for (const candidate of candidates) {
    if (lookupEntry(loc, candidate) !== null) return candidate;
  }
  return key;
};

/**
 * Translation function with fallback behavior.
 * - Locale fallback: Chinese → key itself.
 * - Plural fallback: when params include a numeric `count`, the lookup picks
 *   `${key}_zero` / `${key}_other`, and falls back to the bare key when no
 *   variants exist.
 */
type TranslationParams = Record<string, string | number> & { lng?: Language };

export const t = (
  key: string,
  paramsOrLocale?: TranslationParams | Language,
  legacyParams?: Record<string, string | number>,
): string => {
  const params = legacyParams ?? (typeof paramsOrLocale === "string" ? undefined : paramsOrLocale);
  const loc: Language = typeof paramsOrLocale === "string"
    ? paramsOrLocale
    : isLanguage(params?.lng)
      ? params.lng
      : locale();

  const lookupKey =
    typeof params?.count === "number" ? resolvePluralKey(loc, key, params.count) : key;

  const result = lookupEntry(loc, lookupKey);
  if (result === null) return key;

  if (!params) return result;

  let out = result;
  for (const [k, v] of Object.entries(params)) {
    if (k === "lng") continue;
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
};

/**
 * Initialize locale from localStorage
 * Call this during app initialization
 */
export const initLocale = (): Language => {
  if (typeof window === "undefined") {
    return "zh";
  }

  try {
    const stored = window.localStorage.getItem(LANGUAGE_PREF_KEY);
    if (isLanguage(stored)) {
      localeValue = stored;
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("lang", stored);
      }
      return stored;
    }
  } catch (e) {
    console.warn("Failed to read language preference:", e);
  }

  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", "zh");
  }

  return "zh";
};
