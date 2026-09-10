const WINDOWS_1252_BYTES: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

const MOJIBAKE_MARKERS =
  /\uFFFD|[\u0080-\u009f]|[ÃÂ]|á[º»]|â[€˜™œ¦]|ð[Ÿ]/gu;

const mojibakeScore = (value: string) =>
  Array.from(value.matchAll(MOJIBAKE_MARKERS)).length;

const toLegacyByte = (character: string): number | null => {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return null;
  if (codePoint <= 0xff) return codePoint;
  return WINDOWS_1252_BYTES[codePoint] ?? null;
};

/**
 * Facebook exports sometimes contain UTF-8 bytes interpreted as Latin-1 or
 * Windows-1252. Only repair strings that look like mojibake and only keep the
 * result when it is measurably cleaner. Correct Vietnamese Unicode is left
 * untouched.
 */
const repairMojibakeOnce = (value: string): string => {
  if (!value || mojibakeScore(value) === 0) return value;

  const bytes: number[] = [];
  for (const character of Array.from(value)) {
    const byte = toLegacyByte(character);
    if (byte === null) return value;
    bytes.push(byte);
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(bytes),
    );
    return mojibakeScore(decoded) < mojibakeScore(value) ? decoded : value;
  } catch {
    return value;
  }
};

export const repairFacebookText = (value: string): string => {
  let repaired = value;
  // A few exports have passed through more than one Latin-1/UTF-8 conversion.
  for (let pass = 0; pass < 3; pass++) {
    const next = repairMojibakeOnce(repaired);
    if (next === repaired) break;
    repaired = next;
  }
  return repaired;
};

const asText = (value: unknown): string =>
  typeof value === "string" ? repairFacebookText(value).normalize("NFC") : "";

export const normalizeInlineText = (value: unknown): string =>
  asText(value)
    .replace(/[\u00a0\u2007\u202f]/gu, " ")
    .replace(/[\u200b-\u200d\ufeff]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

export const normalizeContentText = (value: unknown): string =>
  asText(value)
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u00a0\u2007\u202f]/gu, " ")
    .replace(/[\u200b-\u200d\ufeff]/gu, "")
    .replace(/[\t ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

export const normalizeHttpUrl = (value: unknown): string => {
  const text = normalizeInlineText(value);
  if (!text) return "";

  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
};

export const firstHttpUrl = (...values: unknown[]): string => {
  for (const value of values) {
    const url = normalizeHttpUrl(value);
    if (url) return url;
  }
  return "";
};

export const buildFacebookCommentSearchUrl = ({
  content,
  group,
  title,
}: {
  content?: unknown;
  group?: unknown;
  title?: unknown;
}): string => {
  const normalizedContent = normalizeInlineText(content);
  const normalizedGroup = normalizeInlineText(group);
  const normalizedTitle = normalizeInlineText(title);
  const queryParts = [
    normalizedContent.slice(0, 180),
    normalizedGroup,
    normalizedTitle,
  ].filter((value, index, values) => value && values.indexOf(value) === index);

  if (queryParts.length === 0) return "";
  return `https://www.facebook.com/search/posts/?q=${encodeURIComponent(
    queryParts.join(" "),
  )}`;
};
