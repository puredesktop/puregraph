/**
 * Node labels used to be hardcoded white. That is only legible if every node
 * is dark, and node colour is user- and agent-settable — pick a pale yellow
 * and the label vanishes. Text colour has to be derived from whatever the
 * node actually ended up being.
 */

const NEAR_BLACK = '#14181d'
const NEAR_WHITE = '#ffffff'

/** Expand #abc, tolerate missing #, and give up quietly on anything else. */
export function parseHexColor(
  input: string | undefined,
): { r: number; g: number; b: number } | null {
  if (!input) return null
  const raw = input.trim().replace(/^#/, '')
  const hex =
    raw.length === 3
      ? raw
          .split('')
          .map(char => char + char)
          .join('')
      : raw
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(color: string): number | null {
  const rgb = parseHexColor(color)
  if (!rgb) return null
  const channel = (value: number): number => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * channel(rgb.r) +
    0.7152 * channel(rgb.g) +
    0.0722 * channel(rgb.b)
  )
}

/** WCAG contrast ratio between two colours, 1 (identical) to 21 (black/white). */
export function contrastRatio(a: string, b: string): number | null {
  const lumA = relativeLuminance(a)
  const lumB = relativeLuminance(b)
  if (lumA === null || lumB === null) return null
  const lighter = Math.max(lumA, lumB)
  const darker = Math.min(lumA, lumB)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Ink that stays readable on the given fill.
 *
 * Chooses whichever of near-black and white actually contrasts more, rather
 * than guessing from a luminance threshold — mid-tones sit close enough to
 * both that a fixed cutoff picks wrong on exactly the colours people reach
 * for. An unparseable fill falls back to dark ink, which is legible on the
 * pale defaults this app ships with.
 */
export function readableTextColor(background: string | undefined): string {
  if (!background) return NEAR_BLACK
  const againstDark = contrastRatio(background, NEAR_BLACK)
  const againstLight = contrastRatio(background, NEAR_WHITE)
  if (againstDark === null || againstLight === null) return NEAR_BLACK
  return againstDark >= againstLight ? NEAR_BLACK : NEAR_WHITE
}

/** Whether a pairing clears WCAG AA for large/bold text. */
export function meetsLargeTextContrast(
  foreground: string,
  background: string,
): boolean {
  const ratio = contrastRatio(foreground, background)
  return ratio !== null && ratio >= 3
}
