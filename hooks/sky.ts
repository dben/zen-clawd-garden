import type { GardenView, Weather } from '../types'

// ---------- colour helpers ----------

export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v))

const channel = (hex: string, at: number): number => parseInt(hex.slice(at, at + 2), 16)
const two = (v: number): string => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')

/** Blend two six-digit hex colours; t = 0 gives a, t = 1 gives b. */
export const mix = (a: string, b: string, t: number): string => {
  const k = clamp(t)
  let out = '#'
  for (const at of [1, 3, 5]) {
    out += two(channel(a, at) + (channel(b, at) - channel(a, at)) * k)
  }
  return out
}

/** Multiply a colour's brightness. */
export const shade = (a: string, f: number): string =>
  `#${two(channel(a, 1) * f)}${two(channel(a, 3) * f)}${two(channel(a, 5) * f)}`

/** Relative luminance, 0 black to 1 white. */
export const lum = (hex: string): number => {
  const lin = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(channel(hex, 1)) + 0.7152 * lin(channel(hex, 3)) + 0.0722 * lin(channel(hex, 5))
}

// ---------- the sky through the day ----------

export type Sky = {
  /** Sky gradient, zenith to horizon. */
  top: string
  mid: string
  low: string
  /** The light that falls on the garden: every scenery colour is pulled toward `tint` by `k`, then dimmed. */
  tint: string
  k: number
  dim: number
  /** 0 to 1: how visible the stars are, and how much the lanterns glow. */
  stars: number
  glow: number
  /** Seeds for the app's own colours: page colour in light mode, in dark mode, and the accent. */
  paperL: string
  paperD: string
  accent: string
}

const NIGHT: Sky = { top: '#141a3c', mid: '#232b58', low: '#3c4172', tint: '#1b2452', k: 0.56, dim: 0.8, stars: 1, glow: 1, paperL: '#e3e6f3', paperD: '#151a2e', accent: '#7f8fe0' }
const PREDAWN: Sky = { top: '#272b5e', mid: '#6f568a', low: '#e69b7e', tint: '#57477f', k: 0.4, dim: 0.9, stars: 0.4, glow: 0.8, paperL: '#efe3ea', paperD: '#211a2e', accent: '#c96f8e' }
const SUNRISE: Sky = { top: '#6079b5', mid: '#f3b28e', low: '#ffdda8', tint: '#f0a27a', k: 0.2, dim: 0.98, stars: 0, glow: 0.3, paperL: '#f7e8dc', paperD: '#2a1d1e', accent: '#d8684e' }
const MORNING: Sky = { top: '#6fb0e4', mid: '#a9d3f0', low: '#e1f1f6', tint: '#fff4e0', k: 0.06, dim: 1, stars: 0, glow: 0, paperL: '#e5f0f2', paperD: '#14222a', accent: '#2f8576' }
const MIDDAY: Sky = { top: '#5aa6e6', mid: '#9fd0f2', low: '#d8edf8', tint: '#ffffff', k: 0, dim: 1, stars: 0, glow: 0, paperL: '#e7f1ea', paperD: '#13231f', accent: '#2f7d5d' }
const AFTERNOON: Sky = { top: '#6ea9dc', mid: '#b8d7e8', low: '#eff1d8', tint: '#fff0cc', k: 0.08, dim: 1, stars: 0, glow: 0, paperL: '#f1eede', paperD: '#21221a', accent: '#4b8560' }
const GOLDEN: Sky = { top: '#7f9fd0', mid: '#f3cf96', low: '#ffe6b0', tint: '#f7b866', k: 0.16, dim: 1, stars: 0, glow: 0.15, paperL: '#f7ecd6', paperD: '#2a2216', accent: '#c56a2f' }
const SUNSET: Sky = { top: '#6a5c9e', mid: '#f0906c', low: '#ffc680', tint: '#ea7c58', k: 0.27, dim: 0.96, stars: 0.05, glow: 0.6, paperL: '#f7e3da', paperD: '#2c1a1c', accent: '#d8583f' }
const DUSK: Sky = { top: '#2c2f68', mid: '#76508a', low: '#d67d70', tint: '#473a7c', k: 0.44, dim: 0.88, stars: 0.5, glow: 1, paperL: '#ece2ef', paperD: '#1f182c', accent: '#9a78d0' }

const COLOURS = ['top', 'mid', 'low', 'tint', 'paperL', 'paperD', 'accent'] as const
const NUMBERS = ['k', 'dim', 'stars', 'glow'] as const

const blend = (a: Sky, b: Sky, t: number): Sky => {
  const out = { ...a }
  for (const key of COLOURS) {
    out[key] = mix(a[key], b[key], t)
  }
  for (const key of NUMBERS) {
    out[key] = a[key] + (b[key] - a[key]) * t
  }
  return out
}

/** Sunrise and sunset kept sane, so the day always has room for its phases. */
export const sunTimes = (v: Pick<GardenView, 'sunrise' | 'sunset'>): { rise: number; set: number } => {
  let rise = clamp(v.sunrise, 150, 600)
  let set = clamp(v.sunset, 840, 1330)
  if (set - rise < 420) {
    const noon = (rise + set) / 2
    rise = noon - 210
    set = noon + 210
  }
  return { rise, set }
}

const clearSky = (minute: number, rise: number, set: number): Sky => {
  const noon = (rise + set) / 2
  const line: (readonly [number, Sky])[] = [
    [rise - 100, NIGHT],
    [rise - 45, PREDAWN],
    [rise, SUNRISE],
    [rise + 70, MORNING],
    [noon, MIDDAY],
    [set - 110, AFTERNOON],
    [set - 45, GOLDEN],
    [set, SUNSET],
    [set + 35, DUSK],
    [set + 85, NIGHT],
  ]
  let before = line[0]
  for (const stop of line) {
    if (before !== undefined && minute >= before[0] && minute <= stop[0] && stop[0] > before[0]) {
      return blend(before[1], stop[1], (minute - before[0]) / (stop[0] - before[0]))
    }
    before = stop
  }
  return NIGHT
}

const OVERCAST: Record<Weather, number> = { clear: 0, cloudy: 0.14, overcast: 0.6, fog: 0.7, rain: 0.72, storm: 0.84, snow: 0.66 }

const weathered = (s: Sky, weather: Weather): Sky => {
  const amount = OVERCAST[weather]
  if (amount === 0) {
    return s
  }
  const day = clamp(lum(s.mid) * 1.7)
  const grey =
    weather === 'fog' ? mix('#3b4150', '#cfd5d8', day)
    : weather === 'snow' ? mix('#363c4d', '#c6cfd9', day)
    : weather === 'storm' ? mix('#1e2230', '#6c7582', day)
    : mix('#272c3b', '#9ba6b2', day)
  return {
    top: mix(s.top, shade(grey, 0.86), amount),
    mid: mix(s.mid, grey, amount),
    low: mix(s.low, mix(grey, '#ffffff', 0.2), amount),
    tint: mix(s.tint, grey, amount * 0.6),
    k: s.k + amount * 0.16,
    dim: s.dim * (1 - amount * 0.1),
    stars: s.stars * (1 - amount),
    glow: Math.max(s.glow, amount * 0.55),
    paperL: mix(s.paperL, mix('#e8eaec', grey, 0.08), amount * 0.75),
    paperD: mix(s.paperD, '#1a1d24', amount * 0.75),
    accent: mix(s.accent, '#5f86a6', amount * 0.5),
  }
}

export const skyAt = (v: Pick<GardenView, 'minute' | 'sunrise' | 'sunset' | 'weather'>): Sky => {
  const { rise, set } = sunTimes(v)
  return weathered(clearSky(v.minute, rise, set), v.weather)
}

/** What the scenery painters share: the view, its sky, and the light as colour functions. */
export type Ctx = {
  v: GardenView
  sky: Sky
  /** A scenery colour as the current light shows it. */
  c: (hex: string) => string
  /** The same for the crab and its things, which the light touches more gently. */
  cc: (hex: string) => string
  /** The same for ground and leaves, which snow covers. */
  g: (hex: string) => string
  /** 0 day to 1 night. */
  night: number
  isSnowy: boolean
  isWet: boolean
}

export const makeCtx = (v: GardenView): Ctx => {
  const sky = skyAt(v)
  const isSnowy = v.weather === 'snow'
  const c = (hex: string): string => shade(mix(hex, sky.tint, sky.k), sky.dim)
  const snow = c('#eef2f6')
  return {
    v,
    sky,
    c,
    cc: hex => shade(mix(hex, sky.tint, sky.k * 0.4), 1 - (1 - sky.dim) * 0.4),
    g: hex => (isSnowy ? mix(c(hex), snow, 0.8) : c(hex)),
    night: clamp(1 - lum(sky.mid) * 2.2),
    isSnowy,
    isWet: v.weather === 'rain' || v.weather === 'storm',
  }
}

// ---------- weather codes, moon, schedule ----------

/** Open-Meteo's WMO weather code as one of the garden's kinds of weather. */
export const weatherOf = (code: number, cloudCover: number): Weather => {
  if (code >= 95) return 'storm'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if (code === 45 || code === 48) return 'fog'
  if (code === 3 || cloudCover >= 85) return 'overcast'
  if (code === 2 || cloudCover >= 35) return 'cloudy'
  return 'clear'
}

/** Moon phase from the date alone: 0 new, 0.5 full. */
export const moonPhase = (epochMs: number): number => {
  const days = (epochMs - 947182440000) / 86400000
  const phase = (days / 29.530588853) % 1
  return phase < 0 ? phase + 1 : phase
}

export const ACTIVITIES: Record<string, string> = {
  meditate: 'meditating on the island rock',
  stretch: 'greeting the sunrise with a stretch',
  water: 'watering the irises',
  feedkoi: 'feeding the koi',
  rake: 'raking the gravel garden',
  prune: 'pruning the bonsai',
  sweep: 'sweeping petals off the path',
  picnic: 'having rice balls under the cherry tree',
  nap: 'napping under the cherry tree',
  fish: 'fishing from the dock',
  paint: 'painting the mountain',
  tea: 'sipping tea on the veranda',
  stones: 'stacking stones by the pond',
  lanterns: 'lighting the stone lantern',
  flute: 'playing the flute on the bridge',
  stargaze: 'stargazing through a telescope',
  sleep: 'asleep in the tea house',
  umbrella: 'out walking under a paper umbrella',
  puddles: 'splashing in puddles',
  shelter: 'watching the storm from the veranda',
  kite: 'flying a kite in the wind',
  snowcrab: 'building a snow crab',
  lanternwalk: 'walking through the mist with a lantern',
}

const DAYTIME = ['stretch', 'water', 'feedkoi', 'rake', 'prune', 'sweep', 'picnic', 'nap', 'fish', 'paint', 'tea', 'stones'] as const

/** What the crab does at this minute, in this weather. */
export const pickActivity = (v: Pick<GardenView, 'minute' | 'sunrise' | 'sunset' | 'weather' | 'windy'>): string => {
  const { rise, set } = sunTimes(v)
  const m = v.minute
  if (m < rise - 45 || m >= 23 * 60) {
    return 'sleep'
  }
  if (v.weather === 'storm') {
    return 'shelter'
  }
  const dayStart = rise + 30
  const dayEnd = set - 20
  const slot = Math.floor(((m - dayStart) / (dayEnd - dayStart)) * DAYTIME.length)
  const isDay = m >= dayStart && m < dayEnd
  if (v.weather === 'rain') {
    if (!isDay) {
      return m < dayStart ? 'umbrella' : 'shelter'
    }
    // Tea is still tea in the rain; the rest of the day is spent out in it.
    return DAYTIME[slot] === 'tea' ? 'tea' : slot % 2 === 0 ? 'umbrella' : 'puddles'
  }
  if (m < dayStart) {
    return v.weather === 'fog' ? 'lanternwalk' : 'meditate'
  }
  if (isDay) {
    const usual = DAYTIME[slot] ?? 'tea'
    if (v.weather === 'snow') {
      // Too cold to nap, picnic or water: a snow crab gets built, or there is tea.
      const isCosy = usual === 'tea' || usual === 'sweep' || usual === 'stones' || usual === 'paint'
      return isCosy ? usual : slot % 2 === 0 ? 'snowcrab' : 'tea'
    }
    if (v.windy && slot % 3 === 1) {
      return 'kite'
    }
    if (v.weather === 'fog' && slot % 3 === 0) {
      return 'lanternwalk'
    }
    return usual
  }
  if (m < set + 50) {
    return 'lanterns'
  }
  if (m < set + 140) {
    return v.weather === 'fog' ? 'lanternwalk' : 'flute'
  }
  return v.weather === 'clear' || v.weather === 'cloudy' ? 'stargaze' : 'tea'
}
