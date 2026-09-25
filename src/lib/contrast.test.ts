import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  meetsLargeTextContrast,
  parseHexColor,
  readableTextColor,
  relativeLuminance,
} from './contrast'

describe('parseHexColor', () => {
  it('reads six-digit hex with or without a hash', () => {
    expect(parseHexColor('#3f7f5f')).toEqual({ r: 63, g: 127, b: 95 })
    expect(parseHexColor('3f7f5f')).toEqual({ r: 63, g: 127, b: 95 })
  })

  it('expands shorthand', () => {
    expect(parseHexColor('#fc0')).toEqual({ r: 255, g: 204, b: 0 })
  })

  it('gives up on anything else rather than guessing', () => {
    expect(parseHexColor('rebeccapurple')).toBeNull()
    expect(parseHexColor('rgb(1,2,3)')).toBeNull()
    expect(parseHexColor('')).toBeNull()
    expect(parseHexColor(undefined)).toBeNull()
  })
})

describe('relativeLuminance', () => {
  it('anchors at black and white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
  })
})

describe('contrastRatio', () => {
  it('gives 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('gives 1 for a colour against itself', () => {
    expect(contrastRatio('#3f7f5f', '#3f7f5f')).toBeCloseTo(1, 5)
  })
})

describe('readableTextColor', () => {
  it('puts dark ink on the pale fills that broke the old white label', () => {
    // These are exactly the case the user hit: light node, white text.
    for (const pale of ['#ffffff', '#f5f4f0', '#ffe08a', '#c8e6c9', '#fc0']) {
      const ink = readableTextColor(pale)
      expect(meetsLargeTextContrast(ink, pale)).toBe(true)
      expect(ink).toBe('#14181d')
    }
  })

  it('keeps white on the dark cluster colours', () => {
    for (const dark of ['#526070', '#b04d3f', '#3f7f5f', '#4169a8', '#7b5fb2']) {
      const ink = readableTextColor(dark)
      expect(meetsLargeTextContrast(ink, dark)).toBe(true)
      expect(ink).toBe('#ffffff')
    }
  })

  it('always clears AA for large text across the whole hue wheel', () => {
    // A threshold-based rule fails somewhere in the mid-tones; picking the
    // better of the two candidates cannot.
    for (let hue = 0; hue < 360; hue += 15) {
      for (const lightness of [25, 50, 75]) {
        const hex = hslToHex(hue, 65, lightness)
        expect(meetsLargeTextContrast(readableTextColor(hex), hex)).toBe(true)
      }
    }
  })

  it('falls back to dark ink when the fill cannot be read', () => {
    expect(readableTextColor(undefined)).toBe('#14181d')
    expect(readableTextColor('not-a-colour')).toBe('#14181d')
  })
})

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100
  const light = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(light, 1 - light)
  const f = (n: number) =>
    light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}
