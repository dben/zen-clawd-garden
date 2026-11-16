import type { GardenView } from '../types'
import { activityArt, koi } from './crab'
import { ACTIVITIES, clamp, makeCtx, mix, shade, sunTimes } from './sky'
import type { Ctx } from './sky'

// The garden is drawn in real pixels, measured from the middle of the window's
// bottom edge: x runs left and right of centre, y is negative going up. The
// horizon sits 300 px above the bottom whatever the window's size, and the sky
// fills whatever is left above it.
//
// The middle 750 px is where the conversation sits, so it holds only the pond.
// Everything the crab does happens in the 600 px either side of that. Beyond
// those, out to WIDE, is scenery for wide screens.

const HORIZON = -300
const WIDE = 2700
/** The width of the cloud tile, which repeats as it drifts. */
const CLOUDS = 2700
const OPEN_SKY: readonly string[] = ['clear', 'cloudy']

const R = Math.round
const r1 = (v: number): number => Math.round(v * 10) / 10

const rng = (seed: number): (() => number) => {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

// ---------- foliage shapes ----------

type Point = readonly [number, number]

/** A scalloped outline through points given clockwise: each span bulges outward like a clump of leaves. */
const scallop = (points: readonly Point[], rnd: () => number, isClosed: boolean): string => {
  const first = points[0]
  if (first === undefined) {
    return ''
  }
  let px = R(first[0])
  let py = R(first[1])
  let d = `M${px},${py}`
  const count = isClosed ? points.length : points.length - 1
  for (let i = 1; i <= count; i++) {
    const to = points[i % points.length] ?? first
    const dx = R(to[0]) - px
    const dy = R(to[1]) - py
    const k = 0.8 + rnd() * 0.3
    d += `q${R(dx / 2 + dy * k)},${R(dy / 2 - dx * k)} ${dx},${dy}`
    px += dx
    py += dy
  }
  return `${d}z`
}

/** A scalloped blob: lobes of leaf or blossom around an ellipse. */
const puff = (cx: number, cy: number, rx: number, ry: number, rnd: () => number, lobes = 8): string => {
  const turn = rnd() * 6.283
  const points: Point[] = []
  for (let i = 0; i < lobes; i++) {
    const a = turn + ((i + (rnd() - 0.5) * 0.5) / lobes) * 6.283
    const k = 0.9 + rnd() * 0.2
    points.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k])
  }
  return scallop(points, rnd, true)
}

/** The same with a flat foot: a bush, a pad of pine needles, a far-off tree. */
const mound = (cx: number, by: number, rx: number, h: number, rnd: () => number, lobes = 5): string => {
  const points: Point[] = [[cx - rx, by]]
  for (let i = 1; i < lobes; i++) {
    const a = Math.PI + ((i + (rnd() - 0.5) * 0.4) / lobes) * Math.PI
    const k = 0.88 + rnd() * 0.24
    points.push([cx + Math.cos(a) * rx * k, by + Math.sin(a) * h * k])
  }
  points.push([cx + rx, by])
  return scallop(points, rnd, false)
}

/** Dots scattered in an ellipse, as one path: blossoms, flowers, highlights. */
const dots = (cx: number, cy: number, rx: number, ry: number, count: number, rnd: () => number): string => {
  let d = ''
  for (let i = 0; i < count; i++) {
    const a = rnd() * 6.283
    const k = Math.sqrt(rnd())
    d += `M${R(cx + Math.cos(a) * rx * k)},${R(cy + Math.sin(a) * ry * k)}h0`
  }
  return d
}

const speckle = (d: string, colour: string, width: number, opacity = 1): string =>
  d === '' ? '' : `<path d="${d}" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" fill="none"${opacity < 1 ? ` opacity="${opacity}"` : ''}/>`

const filled = (d: string, colour: string): string => (d === '' ? '' : `<path d="${d}" fill="${colour}"/>`)

/** A cloud: a softly scalloped top over a shallower, rounded underside. */
const cloud = (cx: number, cy: number, w: number, rnd: () => number): string => {
  const n = 3 + Math.floor(rnd() * 3)
  const weights: number[] = []
  let total = 0
  for (let i = 0; i < n; i++) {
    const weight = 0.7 + rnd() * 0.6
    weights.push(weight)
    total += weight
  }
  let d = `M${R(cx - w / 2)},${R(cy)}`
  weights.forEach((weight, i) => {
    const span = (w * weight) / total
    // A lobe is never taller than it is round, or the cloud grows spires.
    const h = Math.min(span * 0.56, w * (0.07 + 0.13 * Math.sin((Math.PI * (i + 0.5)) / n)) * (0.75 + rnd() * 0.5))
    d += `a${R(span / 2)},${R(h)} 0 0,1 ${R(span)},0`
  })
  // The underside: two or three shallow bellies, so the cloud has some body.
  const bellies = 2 + Math.floor(rnd() * 2)
  const across = R(w / bellies)
  for (let i = 0; i < bellies; i++) {
    d += `a${R(across / 2)},${R(w * (0.045 + rnd() * 0.04))} 0 0,1 ${-across},0`
  }
  return `${d}z`
}

type Blob = readonly [number, number, number, number]

const CHERRY_FULL: readonly Blob[] = [[-20, -330, 96, 70], [74, -300, 92, 64], [-112, -252, 80, 54], [-44, -292, 86, 60], [52, -334, 84, 60], [142, -262, 82, 54], [-150, -306, 58, 42], [8, -402, 70, 50], [122, -352, 62, 44], [-84, -372, 66, 46], [204, -232, 52, 34]]
const CHERRY_SMALL: readonly Blob[] = [[-10, -318, 96, 68], [-96, -256, 78, 52], [60, -330, 84, 58], [134, -262, 78, 50], [0, -396, 68, 46]]

/** A cherry tree in bloom: a forked trunk, then layer on layer of blossom. */
const cherry = (x: Ctx, bx: number, by: number, s: number, seed: number, blobs: readonly Blob[]): string => {
  const rnd = rng(seed)
  const bark = x.c('#6b4a3c')
  const P = (dx: number, dy: number): string => `${R(bx + dx * s)},${R(by + dy * s)}`
  const trunk =
    `<path d="M${P(-32, 4)}C${P(-16, -30)} ${P(-22, -80)} ${P(-10, -130)}C${P(-6, -160)} ${P(-30, -190)} ${P(-58, -222)}L${P(-46, -232)}C${P(-24, -206)} ${P(0, -190)} ${P(8, -168)}C${P(14, -200)} ${P(20, -232)} ${P(34, -264)}L${P(47, -257)}C${P(36, -226)} ${P(32, -196)} ${P(30, -160)}C${P(52, -178)} ${P(84, -196)} ${P(118, -216)}L${P(125, -203)}C${P(88, -182)} ${P(56, -158)} ${P(38, -128)}C${P(30, -90)} ${P(30, -40)} ${P(42, 4)}Z" fill="${bark}"/>` +
    `<path d="M${P(-8, -6)}C${P(-2, -50)} ${P(-6, -92)} ${P(4, -130)}M${P(12, -8)}C${P(14, -44)} ${P(12, -76)} ${P(18, -108)}" stroke="${x.c('#8c6855')}" stroke-width="${r1(2.6 * s)}" fill="none" stroke-linecap="round" opacity=".7"/>` +
    `<path d="M${P(24, -6)}C${P(22, -50)} ${P(22, -92)} ${P(28, -126)}" stroke="${x.c('#4f352b')}" stroke-width="${r1(4 * s)}" fill="none" stroke-linecap="round" opacity=".55"/>`
  // Blossom goes on in three tiers, back to front, so each clump overlaps the one behind.
  const tiers = [0, 1, 2].map(() => ({ deep: '', mid: '', light: '' }))
  let pale = ''
  let white = ''
  let rosy = ''
  let twigs = ''
  const split = Math.ceil((blobs.length - 2) / 2) + 2
  blobs.forEach(([dx, dy, brx, bry], i) => {
    const cx = bx + dx * s
    const cy = by + dy * s
    const rx = brx * s
    const ry = bry * s
    const tier = tiers[i < 2 ? 0 : i < split ? 1 : 2]
    if (tier !== undefined) {
      tier.deep += puff(cx + rx * 0.04, cy + ry * 0.2, rx, ry, rnd)
      tier.mid += puff(cx, cy, rx * 0.96, ry * 0.9, rnd)
      tier.light += puff(cx - rx * 0.2, cy - ry * 0.24, rx * 0.62, ry * 0.56, rnd, 6)
    }
    pale += dots(cx - rx * 0.12, cy - ry * 0.14, rx * 0.8, ry * 0.74, R(12 * s), rnd)
    white += dots(cx - rx * 0.2, cy - ry * 0.26, rx * 0.6, ry * 0.5, R(6 * s), rnd)
    rosy += dots(cx + rx * 0.14, cy + ry * 0.34, rx * 0.74, ry * 0.5, R(5 * s), rnd)
    if (i % 3 === 0) {
      const side = dx < 0 ? -1 : 1
      twigs += `M${R(cx + side * rx * 0.72)},${R(cy - ry * 0.3)}l${R(side * 22 * s)},${R(-12 * s)}m${R(-side * 8 * s)},${R(4 * s)}l${R(side * 4 * s)},${R(-12 * s)}`
    }
  })
  const tones = [x.c('#ea93b4'), x.c('#f5b5cb'), x.c('#fbd4e1')] as const
  const [back, middle, front] = tiers.map(tier => filled(tier.deep, tones[0]) + filled(tier.mid, tones[1]) + filled(tier.light, tones[2]))
  return (
    (back ?? '') +
    trunk +
    (middle ?? '') +
    (front ?? '') +
    speckle(rosy, x.c('#e27fa3'), r1(5 * s), 0.75) +
    speckle(pale, x.c('#fdeef4'), r1(7 * s)) +
    speckle(white, x.c('#ffffff'), r1(3.6 * s), 0.9) +
    `<path d="${twigs}" stroke="${bark}" stroke-width="${r1(1.8 * s)}" fill="none" stroke-linecap="round"/>`
  )
}

/** A trained garden pine: a leaning trunk carrying flat pads of needles. */
const pine = (x: Ctx, bx: number, by: number, s: number, seed: number, flip = 1): string => {
  const rnd = rng(seed)
  const P = (dx: number, dy: number): string => `${R(bx + dx * s * flip)},${R(by + dy * s)}`
  let dark = ''
  let light = ''
  let glints = ''
  for (const [dx, dy, prx, ph] of [[24, -134, 48, 28], [-38, -68, 38, 21], [48, -98, 34, 19], [-10, -112, 28, 16]] as const) {
    const cx = bx + dx * s * flip
    const cy = by + dy * s
    dark += mound(cx, cy + 3 * s, prx * s, ph * s, rnd, 6)
    light += mound(cx - 4 * s, cy - ph * s * 0.34, prx * s * 0.66, ph * s * 0.62, rnd, 4)
    glints += dots(cx - 4 * s, cy - ph * s * 0.6, prx * s * 0.5, ph * s * 0.24, 3, rnd)
  }
  return (
    `<path d="M${P(-6, 2)}C${P(-14, -34)} ${P(14, -52)} ${P(4, -86)}C${P(-2, -106)} ${P(14, -118)} ${P(20, -136)}" stroke="${x.c('#5b4435')}" stroke-width="${r1(9 * s)}" fill="none" stroke-linecap="round"/>` +
    `<path d="M${P(2, -60)}L${P(-32, -72)}M${P(6, -98)}L${P(42, -102)}M${P(-2, -24)}C${P(-6, -44)} ${P(8, -58)} ${P(2, -80)}" stroke="${x.c('#7a5d4a')}" stroke-width="${r1(3.4 * s)}" fill="none" stroke-linecap="round"/>` +
    filled(dark, x.g('#3b7a54')) +
    filled(light, x.g('#5fa372')) +
    speckle(glints, x.g('#8cc79a'), r1(3 * s), 0.8)
  )
}

/** A maple in autumn colour. */
const maple = (x: Ctx, bx: number, by: number, s: number, seed: number): string => {
  const rnd = rng(seed)
  const P = (dx: number, dy: number): string => `${R(bx + dx * s)},${R(by + dy * s)}`
  let deep = ''
  let mid = ''
  let light = ''
  let sparks = ''
  for (const [dx, dy, brx, bry] of [[-34, -112, 48, 30], [30, -124, 52, 32], [0, -154, 42, 26], [-58, -84, 30, 18], [62, -94, 30, 18]] as const) {
    const cx = bx + dx * s
    const cy = by + dy * s
    deep += puff(cx + 2, cy + bry * s * 0.22, brx * s, bry * s, rnd, 9)
    mid += puff(cx, cy, brx * s * 0.94, bry * s * 0.88, rnd, 9)
    light += puff(cx - brx * s * 0.2, cy - bry * s * 0.26, brx * s * 0.58, bry * s * 0.52, rnd, 6)
    sparks += dots(cx - brx * s * 0.1, cy - bry * s * 0.2, brx * s * 0.7, bry * s * 0.6, 5, rnd)
  }
  return (
    `<path d="M${P(0, 2)}C${P(-6, -30)} ${P(4, -52)} ${P(-2, -78)}M${P(-1, -56)}C${P(-14, -74)} ${P(-26, -84)} ${P(-40, -92)}M${P(0, -62)}C${P(14, -80)} ${P(28, -92)} ${P(44, -100)}" stroke="${x.c('#5a3f33')}" stroke-width="${r1(6.5 * s)}" fill="none" stroke-linecap="round"/>` +
    filled(deep, x.c('#b53e2b')) +
    filled(mid, x.c('#d85a34')) +
    filled(light, x.c('#ec8743')) +
    speckle(sparks, x.c('#f7b45c'), r1(4.4 * s), 0.85)
  )
}

/** Clipped bushes gathered up and painted together, some of them in flower. */
type Shrubs = { shade: string; dark: string; light: string; blooms: Map<string, string> }

const newShrubs = (): Shrubs => ({ shade: '', dark: '', light: '', blooms: new Map() })

const addBush = (to: Shrubs, cx: number, by: number, w: number, rnd: () => number, flower?: string): void => {
  const h = w * (0.48 + rnd() * 0.2)
  const rx = R(w * 0.56)
  const ry = R(w * 0.09)
  to.shade += `M${R(cx) - rx},${R(by)}a${rx},${ry} 0 1,0 ${rx * 2},0a${rx},${ry} 0 1,0 ${-rx * 2},0`
  to.dark += mound(cx, by, w / 2, h, rnd, 6)
  to.light += mound(cx - w * 0.07, by - h * 0.26, w * 0.34, h * 0.6, rnd, 4)
  if (flower !== undefined) {
    to.blooms.set(flower, (to.blooms.get(flower) ?? '') + dots(cx, by - h * 0.46, w * 0.36, h * 0.34, 6, rnd))
  }
}

const drawShrubs = (x: Ctx, shrubs: Shrubs): string => {
  let s = `<path d="${shrubs.shade}" fill="${x.c('#2f5a3a')}" opacity=".22"/>` + filled(shrubs.dark, x.g('#4d8a58')) + filled(shrubs.light, x.g('#69a66c'))
  for (const [flower, d] of shrubs.blooms) {
    s += speckle(d, x.c(flower), 5.2)
  }
  return s
}

const rock = (x: Ctx, cx: number, by: number, w: number, h: number, hasMoss = false): string =>
  `<path d="M${R(cx - w / 2)},${by}Q${R(cx - w * 0.46)},${R(by - h)} ${R(cx - w * 0.06)},${R(by - h)}Q${R(cx + w * 0.42)},${R(by - h * 0.94)} ${R(cx + w / 2)},${by}Z" fill="${x.c('#84868e')}"/>` +
  `<path d="M${R(cx - w * 0.06)},${R(by - h)}Q${R(cx + w * 0.42)},${R(by - h * 0.94)} ${R(cx + w / 2)},${by}H${R(cx + w * 0.1)}Q${R(cx + w * 0.12)},${R(by - h * 0.5)} ${R(cx - w * 0.06)},${R(by - h)}Z" fill="${x.c('#6c6e77')}"/>` +
  `<path d="M${R(cx - w * 0.3)},${R(by - h * 0.56)}Q${R(cx - w * 0.16)},${R(by - h * 0.88)} ${R(cx + w * 0.04)},${R(by - h * 0.84)}" stroke="${x.isSnowy ? x.c('#f4f7fa') : x.c('#b3b5bb')}" stroke-width="${x.isSnowy ? 5 : 2.6}" fill="none" stroke-linecap="round"/>` +
  (hasMoss ? `<ellipse cx="${R(cx)}" cy="${by}" rx="${R(w * 0.56)}" ry="${R(Math.max(3, h * 0.12))}" fill="${x.g('#6f9a5a')}" opacity=".85"/>` : '')

/** A clump of bamboo: jointed stalks, each with fans of drooping leaves. */
const bamboo = (x: Ctx, cx: number, by: number, count: number, tall: number, seed: number): string => {
  const rnd = rng(seed)
  const lean = x.v.windy ? 44 : 8
  const gust = x.v.windy ? 26 : 0
  let stalks = ''
  let twigs = ''
  let dark = ''
  let light = ''
  for (let i = 0; i < count; i++) {
    const bx = cx + (i - (count - 1) / 2) * 15 + rnd() * 7
    const top = by - tall * (0.72 + rnd() * 0.28)
    const tip = bx + lean + rnd() * 14
    stalks += `M${R(bx)},${by}Q${R(bx + lean * 0.2)},${R((by + top) / 2)} ${R(tip)},${R(top)}`
    for (let k = 0; k < 4; k++) {
      const t = 0.46 + k * 0.17
      const lx = bx + (tip - bx) * t * t
      const ly = by + (top - by) * t
      const side = (k + i) % 2 === 0 ? 1 : -1
      const ex = R(lx + side * (16 + rnd() * 8))
      const ey = R(ly - 5 - rnd() * 6)
      twigs += `M${R(lx)},${R(ly)}L${ex},${ey}`
      for (let f = 0; f < 4; f++) {
        const deg = (side > 0 ? 8 + f * 26 : 172 - f * 26) + (rnd() - 0.5) * 14 - gust
        const len = 17 + rnd() * 9
        const leaf = `M${ex},${ey}l${R(Math.cos((deg * Math.PI) / 180) * len)},${R(Math.sin((deg * Math.PI) / 180) * len)}`
        if (f % 2 === 0) {
          dark += leaf
        } else {
          light += leaf
        }
      }
    }
  }
  return (
    `<g class="sw d${seed % 8}"><path d="${stalks}" stroke="${x.g('#5f8f45')}" stroke-width="7.5" fill="none" stroke-linecap="round"/><path d="${stalks}" stroke="${x.g('#86b35c')}" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="36 3"/>` +
    `<path d="${twigs}" stroke="${x.g('#6f9f4a')}" stroke-width="1.6" fill="none"/>${speckle(dark, x.g('#6a9c48'), 4.6)}${speckle(light, x.g('#a2cc6e'), 3.8)}</g>`
  )
}

const irises = (x: Ctx, cx: number, by: number, seed: number): string => {
  const rnd = rng(seed)
  let leaves = ''
  const petals = ['', '', '']
  for (let i = 0; i < 6; i++) {
    const px = R(cx + (i - 2.5) * 22 + rnd() * 10)
    const py = R(by - rnd() * 16)
    const h = R(34 + rnd() * 16)
    leaves += `M${px},${py}q-11,${R(-h * 0.5)} -15,${R(-h * 0.8)}M${px},${py}q9,${R(-h * 0.4)} 13,${R(-h * 0.7)}M${px},${py}q-2,${R(-h * 0.5)} 0,${-h}`
    petals[i % 3] += `M${px},${py - h}q-7,-9 0,-15q7,6 0,15m0,0q-11,0 -12,-8q9,-1 12,8m0,0q11,0 12,-8q-9,-1 -12,8`
  }
  return (
    `<g class="sw d${(seed * 3 + 1) % 8}"><path d="${leaves}" stroke="${x.g('#56975a')}" stroke-width="3" fill="none" stroke-linecap="round"/>` +
    filled(petals[0] ?? '', x.c('#8f7fd6')) +
    filled(petals[1] ?? '', x.c('#a996e8')) +
    filled(petals[2] ?? '', x.c('#f1f0fa')) +
    '</g>'
  )
}

const reeds = (x: Ctx, cx: number, by: number): string =>
  `<g class="sw d${Math.abs(cx) % 8}"><path d="M${cx},${by}q-8,-30 -16,-52M${cx + 5},${by}q0,-36 3,-66M${cx + 10},${by}q8,-28 18,-46M${cx - 5},${by}q-2,-24 -4,-40M${cx + 15},${by}q2,-30 0,-56" stroke="${x.g('#5d9a58')}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
  `<path d="M${cx + 8},${by - 68}v-13M${cx + 15},${by - 58}v-12" stroke="${x.c('#6b4a35')}" stroke-width="5.5" stroke-linecap="round"/></g>`

// ---------- the sky ----------

/** The sun or moon: how far across the window, how high, and how it looks. */
type Orb = { across: number; height: number; below: number; r: number; colour: string; opacity: number }

const sunOf = (x: Ctx): Orb | null => {
  const { rise, set } = sunTimes(x.v)
  const t = (x.v.minute - rise) / (set - rise)
  const w = x.v.weather
  if (t < -0.07 || t > 1.07 || w === 'rain' || w === 'storm' || w === 'snow') {
    return null
  }
  const height = Math.sin(Math.PI * clamp(t))
  return {
    across: 0.1 + clamp(t, -0.07, 1.07) * 0.8,
    height,
    below: t < 0 ? -t * 500 : t > 1 ? (t - 1) * 500 : 0,
    r: 30 + (1 - height) * 9,
    colour: mix('#fff6cf', '#ffae62', (1 - height) ** 2),
    opacity: w === 'fog' || w === 'overcast' ? 0.45 : 1,
  }
}

const moonOf = (x: Ctx): Orb | null => {
  const { rise, set } = sunTimes(x.v)
  const m = x.v.minute
  const w = x.v.weather
  if ((m > rise + 20 && m < set - 20) || w === 'rain' || w === 'storm' || w === 'snow') {
    return null
  }
  const since = m >= set - 20 ? m - set : m + 1440 - set
  const u = clamp(since / (1440 - (set - rise)))
  const opacity = clamp(x.sky.stars * 1.5 + 0.1) * (w === 'overcast' || w === 'fog' ? 0.5 : 1)
  return opacity < 0.15 ? null : { across: 0.14 + u * 0.72, height: Math.sin(Math.PI * u) * 0.94, below: 0, r: 32, colour: '#f5f2df', opacity }
}

/** Places art at a point given as a share of the window: across it, and up from the horizon to near the top. */
const aloft = (orb: Orb, art: string): string =>
  `<g transform="translate(0,${R(HORIZON * (1 - orb.height) + 90 * orb.height + orb.below)})"><svg x="${r1(orb.across * 100)}%" y="${r1((1 - orb.height) * 100)}%" overflow="visible">${art}</svg></g>`

const heavens = (x: Ctx, sun: Orb | null, moon: Orb | null): string => {
  const { sky, v } = x
  let s = '<rect width="100%" height="100%" fill="url(#sk)"/>'
  if (sky.stars > 0.03) {
    s += `<g opacity="${r1(sky.stars * 0.9)}"><rect width="100%" height="100%" fill="url(#st)"/><rect class="tw" width="100%" height="100%" fill="url(#st)" transform="translate(-317,-203)"/></g>`
  }
  if (moon !== null) {
    const p = v.moon
    const edge = r1(Math.abs(Math.cos(2 * Math.PI * p)) * moon.r)
    const isCrescent = p < 0.25 || p > 0.75
    s += aloft(
      moon,
      `<g opacity="${r1(moon.opacity)}"><circle r="${moon.r * 3.2}" fill="url(#wh)" opacity=".5"/><circle r="${moon.r}" fill="${moon.colour}" opacity=".13"/>` +
        `<path transform="scale(${p < 0.5 ? 1 : -1},1)" d="M0,${-moon.r}A${moon.r},${moon.r} 0 0,1 0,${moon.r}A${edge},${moon.r} 0 0,${isCrescent ? 0 : 1} 0,${-moon.r}Z" fill="${moon.colour}"/></g>`,
    )
  }
  if (sun !== null) {
    s += aloft(sun, `<circle r="${r1(sun.r * 6)}" fill="url(#sg)" opacity="${r1(sun.opacity * 0.9)}"/><circle r="${r1(sun.r)}" fill="${sun.colour}" opacity="${sun.opacity}"/>`)
  }
  // Clouds hang from the top of the window, so a taller window has more open sky beneath them.
  const heavy = v.weather === 'overcast' || v.weather === 'rain' || v.weather === 'storm' || v.weather === 'snow' || v.weather === 'fog'
  const fill = heavy ? shade(mix(sky.mid, sky.top, 0.35), 0.9 + x.night * 0.1) : mix(sky.mid, '#ffffff', 0.12 + 0.68 * (1 - x.night))
  const rnd = rng(5)
  let pale = ''
  let grey = ''
  const gap = heavy ? 210 : v.weather === 'cloudy' ? 330 : 780
  for (let px = 250; px < CLOUDS - 250; px += gap * (0.7 + rnd() * 0.6)) {
    const path = cloud(px, (heavy ? 70 : 96) + rnd() * (heavy ? 190 : 150), (heavy ? 300 : 150) + rnd() * 170, rnd)
    if (heavy && rnd() < 0.34) {
      pale += path
    } else {
      grey += path
    }
  }
  s +=
    `<pattern id="cl" width="${CLOUDS}" height="420" patternUnits="userSpaceOnUse"><path d="${grey}" fill="${fill}" opacity="${heavy ? 0.92 : v.weather === 'cloudy' ? 0.86 : 0.62}"/>${pale === '' ? '' : `<path d="${pale}" fill="${mix(fill, sky.low, 0.28)}" opacity=".9"/>`}</pattern>` +
    `<svg x="50%" overflow="visible">${heavy ? '<rect x="-3000" width="6000" height="340" fill="url(#cv)"/>' : ''}<rect class="dr" x="-8100" width="10800" height="420" fill="url(#cl)"/></svg>`
  if (v.motion && sky.stars > 0.4 && OPEN_SKY.includes(v.weather)) {
    s += '<svg x="72%" y="12%" overflow="visible"><path class="ss" d="M0,0l-64,24" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity="0"/></svg><svg x="28%" y="20%" overflow="visible"><path class="ss s4" d="M0,0l-64,24" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0"/></svg>'
  }
  if (v.weather === 'storm') {
    s += '<svg x="30%" y="5%" overflow="visible"><path class="lt" d="M72,0L12,156L44,152L0,278L88,126L54,132L98,0Z" fill="#fff7c9" opacity=".9"/></svg>'
  }
  return s
}

// ---------- the land ----------

/** A smooth ridge line from the left edge to the right, as the top of a filled shape. */
const ridge = (seed: number, base: number, low: number, high: number, step: number): string => {
  const rnd = rng(seed)
  let px = -WIDE - 200
  let py = base - low
  let d = `M${px},${HORIZON + 40}V${R(py)}`
  while (px < WIDE + 200) {
    const nx = px + step * (0.7 + rnd() * 0.6)
    const ny = base - low - rnd() * (high - low)
    d += `Q${R(px)},${R(py)} ${R((px + nx) / 2)},${R((py + ny) / 2)}`
    px = nx
    py = ny
  }
  return `${d}V${HORIZON + 40}Z`
}

const land = (x: Ctx): string => {
  const { sky, c, g } = x
  const peak = mix(c('#7482b2'), sky.mid, 0.4)
  const cap = mix(c('#f6f8fc'), sky.mid, 0.12)
  const rnd = rng(3)
  // Low cloud along the horizon, behind the mountains.
  let drift = ''
  for (let px = -WIDE + 200; px < WIDE; px += 520 + rnd() * 380) {
    drift += cloud(px, HORIZON - 120 - rnd() * 90, 240 + rnd() * 200, rnd)
  }
  let s = `<path d="${drift}" fill="${mix(sky.low, '#ffffff', 0.5)}" opacity=".5"/>`
  if (OPEN_SKY.includes(x.v.weather) && x.night < 0.35) {
    s += `<g stroke="${c('#4a5568')}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".65"><path class="bd" d="M-330,-610q8,-8 16,0q8,-8 16,0"/><path class="bd b1" d="M-278,-640q7,-7 14,0q7,-7 14,0"/><path class="bd b2" d="M-236,-596q6,-6 12,0q6,-6 12,0"/></g>`
  }
  // Far ranges, then the mountain with its snow.
  s += `<path d="${ridge(7, HORIZON, 50, 170, 260)}" fill="${mix(peak, sky.mid, 0.45)}"/>`
  for (const [mx, k] of [[-1760, 0.62], [1980, 0.54]] as const) {
    s += `<path d="M${R(mx - 420 * k)},-290Q${R(mx - 130 * k)},${R(-330 - 250 * k)} ${mx},${R(-300 - 350 * k)}Q${R(mx + 150 * k)},${R(-330 - 240 * k)} ${R(mx + 460 * k)},-290Z" fill="${mix(peak, sky.mid, 0.25)}"/>`
    s += `<path d="M${R(mx - 62 * k)},${R(-300 - 284 * k)}Q${R(mx - 20 * k)},${R(-300 - 340 * k)} ${mx},${R(-300 - 350 * k)}Q${R(mx + 24 * k)},${R(-300 - 338 * k)} ${R(mx + 70 * k)},${R(-300 - 280 * k)}l${R(-30 * k)},${R(-14 * k)} ${R(-24 * k)},${R(22 * k)} ${R(-30 * k)},${R(-26 * k)} ${R(-26 * k)},${R(26 * k)}Z" fill="${cap}" opacity=".9"/>`
  }
  s += `<path d="M-420,-290C-200,-360 -30,-520 70,-620Q100,-648 140,-650Q180,-648 205,-622C300,-520 470,-360 700,-290Z" fill="${x.isSnowy ? mix(peak, cap, 0.35) : peak}"/>`
  s += `<path d="M140,-650Q180,-648 205,-622C300,-520 470,-360 700,-290H300C250,-400 190,-530 140,-650Z" fill="${shade(peak, 0.84)}" opacity=".55"/>`
  s += `<path d="M2,-554C27,-578 50,-600 70,-620Q100,-648 140,-650Q180,-648 205,-622C224,-602 246,-579 271,-555l-30,-18 -18,32 -30,-36 -22,40 -32,-44 -26,44 -30,-40 -26,36 -28,-34 -27,21Z" fill="${cap}"/>`
  s += `<path d="M140,-650Q180,-648 205,-622C224,-602 246,-579 271,-555l-30,-18 -18,32 -30,-36 -12,22C172,-590 156,-622 140,-650Z" fill="${shade(cap, 0.9)}" opacity=".6"/>`
  // Nearer hills, haze, and the wooded far bank.
  s += `<path d="${ridge(13, HORIZON, 26, 96, 340)}" fill="${mix(g('#86a890'), sky.low, 0.38)}"/>`
  s += `<rect x="-3000" y="${HORIZON - 100}" width="6000" height="130" fill="url(#mi)" opacity="${x.v.weather === 'fog' ? 1 : 0.6}"/>`
  let far = ''
  let near = ''
  let cedars = ''
  for (let px = -WIDE; px < WIDE; px += 60 + rnd() * 40) {
    far += mound(px, HORIZON + 6, 40 + rnd() * 24, 46 + rnd() * 34, rnd, 4)
    if (rnd() < 0.12) {
      cedars += `M${R(px - 15)},${HORIZON}l15,${R(-74 - rnd() * 40)}l15,${R(74 + rnd() * 40)}z`
    }
  }
  for (let px = -WIDE; px < WIDE; px += 70 + rnd() * 44) {
    near += mound(px, HORIZON + 8, 38 + rnd() * 20, 26 + rnd() * 22, rnd, 4)
  }
  const wood = mix(g('#5f9470'), sky.low, 0.22)
  s += `<path d="${cedars}" fill="${mix(g('#3f7458'), sky.low, 0.2)}"/><path d="${far}" fill="${wood}"/><path d="${near}" fill="${mix(g('#4f8762'), sky.low, 0.1)}"/>`
  // The lawn, with a low fence along its far edge.
  s += `<rect x="-3000" y="${HORIZON - 16}" width="6000" height="26" fill="url(#fc)"/>`
  s += `<path d="M-3000,${HORIZON + 4}Q-1500,${HORIZON - 12} 0,${HORIZON}T3000,${HORIZON + 2}V80H-3000Z" fill="url(#lw)"/>`
  s += `<path d="M-3000,-206Q-1400,-238 0,-212T3000,-216V-188Q1400,-202 0,-186T-3000,-176ZM-3000,-92Q-1300,-120 0,-98T3000,-104V-66Q1300,-84 0,-62T-3000,-54Z" fill="${g('#b4dc9a')}" opacity=".16"/>`
  const lawn = rng(19)
  s += speckle(dots(0, -150, WIDE, 140, 90, lawn), g('#fbfbf2'), 3.4, 0.8) + speckle(dots(0, -150, WIDE, 140, 50, lawn), g('#f6dc74'), 3, 0.8)
  return s
}

/** Shrubs along the back of the lawn, the whole width of the scene. */
const hedgerow = (x: Ctx): string => {
  const rnd = rng(31)
  const shrubs = newShrubs()
  for (let px = -WIDE + 40; px < WIDE; px += 150 + rnd() * 110) {
    const pick = rnd()
    if ((px > -560 && px < -330) || (px > 870 && px < 1070)) {
      continue
    }
    addBush(shrubs, px, HORIZON + 40 + rnd() * 18, 58 + rnd() * 44, rnd, pick < 0.32 ? '#f08fb0' : pick < 0.46 ? '#fbf3f6' : pick < 0.56 ? '#f2c14e' : undefined)
  }
  return drawShrubs(x, shrubs)
}

/** Scenery beyond the two activity bands: what a wide screen shows either side. */
const outskirts = (x: Ctx): string => {
  const { c } = x
  const red = c('#b8432f')
  const ink = c('#3b2f2c')
  const stone = c('#a9a59b')
  let s = ''
  // A torii and its path, far left.
  s += `<path d="M-1290,-232l7,-152h11l7,152zM-1203,-232l7,-152h11l7,152z" fill="${red}"/><rect x="-1302" y="-360" width="144" height="11" fill="${red}"/><rect x="-1236" y="-376" width="12" height="18" fill="${ink}"/>`
  s += `<path d="M-1322,-400q92,15 184,0l-7,17q-85,11 -170,0z" fill="${ink}"/><path d="M-1314,-385q84,10 168,0v10q-84,10 -168,0z" fill="${red}"/>`
  for (const [px, py, prx] of [[-1230, -214, 26], [-1212, -178, 29], [-1180, -140, 32], [-1140, -98, 35], [-1094, -52, 38], [-1050, -6, 40]] as const) {
    s += `<ellipse cx="${px}" cy="${py}" rx="${prx}" ry="${r1(prx * 0.3)}" fill="${x.isSnowy ? c('#f4f7fa') : c('#bdb7aa')}"/>`
  }
  // A five-storey stone pagoda, far right.
  let storeys = ''
  let roofs = ''
  for (let i = 0; i < 5; i++) {
    const w = 92 - i * 13
    const py = -250 - i * 34
    storeys += `M${R(1340 - w * 0.24)},${py}h${R(w * 0.48)}v22h${R(-w * 0.48)}z`
    roofs += `M${R(1340 - w / 2)},${py}q8,-3 12,-12h${R(w - 24)}q4,9 12,12z`
  }
  s += filled(storeys, c('#8c887f')) + filled(roofs, x.isSnowy ? c('#f4f7fa') : stone)
  s += `<rect x="1300" y="-228" width="80" height="10" rx="2" fill="${stone}"/><path d="M1340,-398v-34" stroke="${stone}" stroke-width="5" stroke-linecap="round"/>`
  // Trees of each kind out to a 4K screen's edges, then thinning toward the widest.
  const trees: (readonly [number, string])[] = [
    [-236, pine(x, -1100, -236, 0.95, 61)],
    [-196, maple(x, -1400, -196, 0.9, 63)],
    [-248, cherry(x, -1570, -248, 0.8, 62, CHERRY_SMALL)],
    [-256, bamboo(x, -1760, -256, 5, 250, 64)],
    [-232, pine(x, -1900, -232, 1.05, 65, -1)],
    [-226, maple(x, 1100, -226, 0.92, 71)],
    [-256, bamboo(x, 1210, -256, 5, 260, 72)],
    [-236, pine(x, 1500, -236, 1.05, 73, -1)],
    [-250, cherry(x, 1730, -250, 0.84, 74, CHERRY_SMALL)],
    [-190, maple(x, 1930, -190, 0.78, 75)],
    [-238, pine(x, -2180, -238, 0.92, 76)],
    [-214, maple(x, -2440, -214, 0.9, 69)],
    [-238, pine(x, 2170, -238, 0.92, 77)],
    [-248, cherry(x, 2440, -248, 0.8, 78, CHERRY_SMALL)],
  ]
  s += trees
    .sort((one, other) => one[0] - other[0])
    .map(tree => tree[1])
    .join('')
  return s
}

/** Rocks, shrubs and irises nearer the front, either side of the garden. */
const verges = (x: Ctx): string => {
  let s = ''
  let rocks = ''
  const rnd = rng(83)
  const shrubs = newShrubs()
  for (const side of [-1, 1]) {
    for (let px = 1060; px < WIDE; px += 250 + rnd() * 190) {
      const py = R(-150 + rnd() * 130)
      const pick = rnd()
      if (pick < 0.3) {
        rocks += rock(x, side * px, py, 54 + rnd() * 40, 26 + rnd() * 20, true)
      } else if (pick < 0.75 || px > 1950) {
        addBush(shrubs, side * px, py, 64 + rnd() * 40, rnd, rnd() < 0.5 ? '#f08fb0' : undefined)
        addBush(shrubs, side * px + 52, py + 10, 46, rnd)
      } else {
        s += irises(x, side * px, py, R(px))
      }
    }
  }
  return s + drawShrubs(x, shrubs) + rocks
}

/** A small tea room: plain timber, paper screens, a round window, and one low, deep-eaved roof. */
const teaHouse = (x: Ctx, glow: number): { back: string; front: string } => {
  const { c } = x
  const wood = c('#6e4c36')
  const woodDark = c('#4a3325')
  const woodLight = c('#a67a54')
  const roof = x.isSnowy ? c('#c9ced4') : c('#6f6a63')
  const roofDark = c('#4b4743')
  const roofLight = x.isSnowy ? c('#f6f8fb') : c('#989186')
  const stone = c('#b8b1a4')
  const stoneLight = c('#cfc9bd')
  const plaster = mix(c('#e9dfc9'), '#ffdf9e', glow * 0.3)
  const paper = mix(c('#f7f0de'), '#ffd98a', glow * 0.8)
  const inside = mix(c('#5d4636'), '#f0b25a', glow * 0.5)
  const lamp = mix(c('#d94a3a'), '#ffb14a', glow * 0.65)
  // The veranda stands on short posts over foundation stones.
  let back = `<rect x="1234" y="636" width="282" height="24" fill="${woodDark}" opacity=".55"/><path d="M1242,636V662M1308,636V662M1442,636V662M1508,636V662" stroke="${wood}" stroke-width="7"/>`
  back += `<path d="M1232,664q10,-9 20,0zM1298,664q10,-9 20,0zM1432,664q10,-9 20,0zM1498,664q10,-9 20,0z" fill="${stone}"/>`
  back += `<rect x="1254" y="512" width="242" height="118" fill="${plaster}"/>`
  // Left bay: sliding paper screens over a low timber panel.
  back += `<rect x="1262" y="530" width="76" height="76" fill="${paper}"/><rect x="1262" y="606" width="76" height="22" fill="${woodLight}"/>`
  back += `<path d="M1281,530V606M1319,530V606M1262,549H1338M1262,568H1338M1262,587H1338M1281,606V628M1319,606V628" stroke="${woodLight}" stroke-width="1.5"/><path d="M1300,530V628" stroke="${wood}" stroke-width="3"/>`
  // The open doorway, with a scroll hanging in the alcove behind.
  back += `<rect x="1343" y="528" width="74" height="102" fill="${inside}"/><rect x="1392" y="552" width="14" height="40" fill="${paper}" opacity=".55"/><path d="M1390,552h18M1390,592h18" stroke="${woodDark}" stroke-width="2" opacity=".7"/>`
  // Right bay: a round window with a bamboo lattice.
  back += `<circle cx="1457" cy="572" r="31" fill="${paper}"/><path d="M1446,543V601M1468,543V601M1428,561H1486M1428,584H1486" stroke="${woodLight}" stroke-width="2"/><circle cx="1457" cy="572" r="31" fill="none" stroke="${wood}" stroke-width="4.5"/>`
  back += `<rect x="1424" y="612" width="70" height="16" fill="${woodLight}" opacity=".6"/>`
  back += `<rect x="1224" y="627" width="302" height="8" rx="2" fill="${woodLight}"/><rect x="1224" y="634" width="302" height="3.5" fill="${wood}"/>`
  if (glow > 0.2) {
    back += `<ellipse cx="1375" cy="580" rx="230" ry="150" fill="url(#hl)" opacity="${r1(glow * 0.5)}"/>`
  }
  let front = `<path d="M1256,512V628M1340,524V628M1420,524V628M1494,512V628" stroke="${wood}" stroke-width="6"/><rect x="1248" y="510" width="254" height="16" fill="${woodDark}"/>`
  // A short split curtain over the door.
  front += `<path d="M1344,526h23v21h-23zM1368.500,526h23v23h-23zM1393,526h23v21h-23z" fill="${c('#3f5b7d')}"/><path d="M1355.500,537h.1M1380,538h.1M1404.500,537h.1" stroke="${c('#e9e4d4')}" stroke-width="6" stroke-linecap="round"/>`
  // One broad roof: a short ridge, long concave slopes, eaves that lift at the corners.
  const slope = 'M1170,526Q1240,500 1298,436Q1320,408 1328,374H1422Q1430,408 1452,436Q1510,500 1580,526Q1478,507 1375,507Q1272,507 1170,526Z'
  front += `<path d="M1180,522Q1375,478 1570,522L1556,531Q1375,511 1194,531Z" fill="${woodDark}"/><path d="${slope}" fill="${roof}"/>`
  front += `<path d="M1318,414Q1375,407 1432,414M1296,440Q1375,430 1454,440M1268,468Q1375,456 1482,468M1232,496Q1375,482 1518,496" stroke="${roofDark}" stroke-width="2" fill="none" opacity="${x.isSnowy ? 0.18 : 0.42}"/>`
  front += `<path d="M1352,376L1340,432Q1326,480 1300,507M1398,376L1410,432Q1424,480 1450,507M1375,376V507" stroke="${roofDark}" stroke-width="1.6" fill="none" opacity="${x.isSnowy ? 0.12 : 0.28}"/>`
  front += `<path d="M1173,524Q1240,499 1298,436Q1320,408 1328,378M1422,378Q1430,408 1452,436Q1510,499 1577,524" stroke="${roofLight}" stroke-width="${x.isSnowy ? 8 : 3}" fill="none" stroke-linecap="round"/>`
  front += `<path d="M1314,372H1436M1314,372q-9,-2 -13,-13M1436,372q9,-2 13,-13" stroke="${roofDark}" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M1316,368H1434" stroke="${roofLight}" stroke-width="${x.isSnowy ? 6 : 2.4}" stroke-linecap="round" opacity="${x.isSnowy ? 1 : 0.7}"/>`
  // Paper lanterns under the eaves.
  for (const lx of [1214, 1536]) {
    if (glow > 0.2) {
      front += `<circle class="fl" cx="${lx}" cy="540" r="44" fill="url(#hl)" opacity="${r1(glow * 0.8)}"/>`
    }
    front += `<path d="M${lx},520 v8" stroke="${woodDark}" stroke-width="2"/><ellipse cx="${lx}" cy="540" rx="9.5" ry="12.5" fill="${lamp}"/><rect x="${lx - 5}" y="526" width="10" height="3" fill="${c('#3b2f2c')}"/><rect x="${lx - 5}" y="551" width="10" height="3" fill="${c('#3b2f2c')}"/>`
  }
  front += `<rect x="1345" y="640" width="70" height="12" rx="2" fill="${stoneLight}"/><rect x="1337" y="652" width="86" height="13" rx="2" fill="${stone}"/>`
  return { back, front }
}

const pond = (x: Ctx, orb: Orb | null): string => {
  const { sky, c, g } = x
  let s = `<path d="M-722,-170C-722,-218 -560,-242 -100,-240C260,-238 518,-222 524,-170C530,-120 300,-102 -100,-100C-540,-98 -722,-124 -722,-170Z" fill="url(#pw)" stroke="${g('#6d9a5c')}" stroke-width="5"/>`
  s += `<ellipse cx="-100" cy="-214" rx="430" ry="15" fill="${sky.low}" opacity=".24"/>`
  if (orb !== null) {
    const ox = R(clamp((orb.across - 0.5) * 1900, -360, 380))
    s += `<g fill="${orb.colour}" opacity="${r1(orb.opacity * 0.42)}"><ellipse cx="${ox}" cy="-200" rx="30" ry="2.2"/><ellipse cx="${ox + 6}" cy="-186" rx="46" ry="2.6"/><ellipse cx="${ox - 8}" cy="-171" rx="58" ry="3"/><ellipse cx="${ox + 4}" cy="-156" rx="40" ry="2.6"/><ellipse cx="${ox}" cy="-142" rx="22" ry="2.2"/></g>`
  }
  // Each koi swims a slow circle, seen at the pond's own slant, nose first.
  for (const [i, cx, cy, radius, from, hex, spot] of [[0, -150, -172, 92, 200, '#f08a3c', '#fbf3e4'], [1, 250, -166, 78, 40, '#fbf3e4', '#e8553c'], [2, 40, -160, 112, 100, '#e8553c', '#fbf3e4'], [3, -60, -178, 58, 290, '#f2b33c', '#fbf3e4']] as const) {
    s += `<g transform="translate(${cx},${cy}) scale(1,.46)"><g transform="rotate(${from})"><g class="k${i}"><g transform="translate(${radius},0) rotate(${i % 2 === 0 ? 90 : -90}) scale(1.2,1.7)">${koi(x, 0, 0, 0, hex, spot)}</g></g></g></g>`
  }
  for (const [px, py, pr] of [[-190, -150, 20], [-150, -137, 15], [-290, -124, 18], [130, -190, 17], [-360, -160, 14], [330, -134, 16], [20, -160, 15], [210, -120, 14], [-600, -128, 15]] as const) {
    s += `<ellipse cx="${px}" cy="${py}" rx="${pr}" ry="${r1(pr * 0.36)}" fill="${c('#5fa66c')}"/><path d="M${px},${py}l${pr - 2},-3" stroke="${c('#4a8a58')}" stroke-width="1.6"/>`
  }
  for (const [px, py] of [[-190, -153], [130, -193], [-600, -131], [330, -137]] as const) {
    s += `<path d="M${px},${py}q-8,-12 0,-17q8,5 0,17M${px},${py}q-14,-4 -13,-12q10,0 13,12M${px},${py}q14,-4 13,-12q-10,0 -13,12" fill="${c('#f6b6cd')}"/><circle cx="${px}" cy="${py - 6}" r="2.6" fill="${c('#f6dc74')}"/>`
  }
  const drops = rng(41)
  let rings = ''
  for (let i = 0; i < (x.isWet ? 26 : 4); i++) {
    const rr = i < 4 ? 14 + drops() * 8 : 6 + drops() * 12
    rings += `<ellipse class="rp d${i % 8}" cx="${R(-600 + drops() * 1040)}" cy="${R(-222 + drops() * 104)}" rx="${r1(rr)}" ry="${r1(rr * 0.27)}"/>`
  }
  s += `<g fill="none" stroke="#fff" stroke-width="1.6" opacity=".4">${rings}</g>`
  s += reeds(x, -676, -124) + reeds(x, 372, -112) + reeds(x, -30, -236)
  for (const [px, py, prx, pry] of [[-690, -130, 18, 8], [-634, -112, 24, 10], [-552, -102, 18, 8], [-430, -97, 22, 9], [-300, -98, 17, 7], [-110, -97, 22, 9], [70, -99, 18, 8], [250, -105, 24, 10], [392, -118, 19, 8], [474, -136, 17, 8], [514, -160, 13, 7]] as const) {
    s += `<ellipse cx="${px}" cy="${py}" rx="${prx}" ry="${pry}" fill="${c('#9a9aa0')}"/><ellipse cx="${px - 3}" cy="${py - 3}" rx="${r1(prx * 0.6)}" ry="${r1(pry * 0.45)}" fill="${x.isSnowy ? c('#f4f7fa') : c('#b6b6bc')}" opacity=".8"/>`
  }
  return s
}

/** The island with its sitting rock and pine, and the bridge to it. Drawn in its own frame, see ISLE. */
const isle = (x: Ctx): string => {
  const { c, g } = x
  const span = bridge(x)
  return (
    `<ellipse cx="480" cy="696" rx="96" ry="22" fill="${c('#7a6b55')}"/><ellipse cx="480" cy="689" rx="92" ry="20" fill="${g('#80b66c')}"/>` +
    `<path d="M414,686Q418,652 450,650Q486,650 492,686Z" fill="${c('#9a9aa0')}"/><path d="M450,650Q486,650 492,686H462Q464,664 450,650Z" fill="${c('#7f8088')}"/><path d="M430,662Q446,654 462,656" stroke="${c('#bdbdc3')}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>` +
    pine(x, 540, 690, 0.86, 47) +
    span.deck +
    span.rail
  )
}

const bridge = (x: Ctx): { deck: string; rail: string } => {
  const red = x.c('#b23c2c')
  const deep = x.c('#832a20')
  const deck =
    `<path d="M240,704 Q325,764 410,702" stroke="${red}" stroke-width="7" fill="none" opacity=".18"/>` +
    `<path d="M232,700 Q325,604 418,698" stroke="${deep}" stroke-width="6" fill="none"/><path d="M232,694 Q325,598 418,692" stroke="${red}" stroke-width="9" fill="none" stroke-linecap="round"/>`
  let posts = ''
  for (const t of [0.03, 0.22, 0.41, 0.59, 0.78, 0.97]) {
    const px = r1((1 - t) ** 2 * 232 + 2 * (1 - t) * t * 325 + t * t * 418)
    const py = r1((1 - t) ** 2 * 694 + 2 * (1 - t) * t * 598 + t * t * 692)
    posts += `M${px},${py - 3}V${r1(py - 33)}`
  }
  const rail =
    `<path d="${posts}" stroke="${deep}" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M232,680 Q325,584 418,678" stroke="${red}" stroke-width="2.6" fill="none"/><path d="M230,667 Q325,570 420,665" stroke="${red}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
    (x.isSnowy ? `<path d="M230,663 Q325,566 420,661" stroke="${x.c('#f4f7fa')}" stroke-width="3" fill="none" stroke-linecap="round"/>` : '')
  return { deck, rail }
}

const stoneLantern = (x: Ctx, glow: number): string => {
  const { c } = x
  const stone = c('#a9a59b')
  const stoneDark = c('#8c887f')
  let s = glow > 0.15 ? `<circle class="fl" cx="1070" cy="631" r="74" fill="url(#hl)" opacity="${r1(glow)}"/>` : ''
  s += `<rect x="1050" y="686" width="40" height="9" rx="2" fill="${stone}"/><rect x="1063" y="650" width="14" height="37" fill="${stoneDark}"/><rect x="1050" y="642" width="40" height="9" rx="2" fill="${stone}"/>`
  s += `<rect x="1056" y="620" width="28" height="23" fill="${stoneDark}"/><rect x="1062" y="624" width="16" height="15" rx="2" fill="${mix(c('#4a4640'), '#ffd27a', glow)}"/>`
  s += `<path d="M1038,623Q1070,594 1102,623Q1070,614 1038,623Z" fill="${x.isSnowy ? c('#f4f7fa') : stone}"/><circle cx="1070" cy="603" r="5.5" fill="${stone}"/>`
  return s
}

const furnishings = (x: Ctx, glow: number): string => {
  const { c, g } = x
  const snowy = c('#f4f7fa')
  // The dock, in its old frame.
  let s = `<g transform="translate(-488,-858)"><path d="M900,698V726M946,698V722M996,698V706" stroke="${c('#6f4d36')}" stroke-width="7" stroke-linecap="round"/><path d="M888,688H1016L1022,699H882Z" fill="${x.isSnowy ? snowy : c('#b08258')}"/>`
  s += `<path d="M910,688l-3,11M940,688l-2,11M970,688v11M998,688l2,11" stroke="${c('#8f6642')}" stroke-width="1.5" opacity=".7"/></g>`
  s += `<g transform="translate(-494,-881)">${stoneLantern(x, glow)}</g>`
  // Gravel garden.
  s += `<ellipse cx="705" cy="-72" rx="152" ry="41" fill="${c(x.isSnowy ? '#eef1f4' : '#e6dcc4')}" stroke="${c('#b9ac8c')}" stroke-width="3"/>`
  let raked = ''
  for (const [rx, ry] of [[34, 10], [47, 14], [60, 18]] as const) {
    raked += `<ellipse cx="640" cy="-78" rx="${rx}" ry="${ry}"/><ellipse cx="786" cy="-64" rx="${rx - 10}" ry="${ry - 3}"/>`
  }
  s += `<g fill="none" stroke="${c('#cabb98')}" stroke-width="2">${raked}<path d="M600,-48q20,-6 40,0t40,0t40,0t40,0t40,0M624,-38q20,-6 40,0t40,0t40,0t40,0"/></g>`
  s += rock(x, 640, -76, 50, 32, true) + rock(x, 790, -62, 36, 20) + rock(x, 766, -58, 20, 10)
  // Bonsai on its stand.
  s += `<g transform="translate(-569,-890)"><path d="M1170,690H1208M1174,690V707M1204,690V707" stroke="${c('#7a5038')}" stroke-width="4" stroke-linecap="round"/><path d="M1176,677H1202L1198,689H1180Z" fill="${c('#3f6190')}"/>`
  s += `<path d="M1189,678C1184,668 1196,662 1190,652C1187,646 1194,642 1198,640" stroke="${c('#5b4435')}" stroke-width="4" fill="none" stroke-linecap="round"/>`
  const rnd = rng(59)
  s += `<path d="${mound(1201, 643, 17, 12, rnd, 5)}${mound(1179, 657, 13, 9, rnd, 4)}" fill="${g('#3f7a54')}"/><path d="${mound(1198, 636, 10, 8, rnd, 4)}" fill="${g('#62a271')}"/></g>`
  // Stepping stones from the tea house steps.
  for (const [px, py, prx] of [[832, -190, 24], [868, -162, 27], [900, -128, 30], [926, -90, 32], [948, -50, 35], [966, -8, 38]] as const) {
    s += `<ellipse cx="${px}" cy="${py + 3}" rx="${prx}" ry="${r1(prx * 0.32)}" fill="${c('#8c887f')}" opacity=".5"/><ellipse cx="${px}" cy="${py}" rx="${prx}" ry="${r1(prx * 0.32)}" fill="${x.isSnowy ? snowy : c('#bdb7aa')}"/>`
  }
  return s
}

/** Bushes at the back of the two activity bands: painted early, so the trees and the furniture in front of them cover them. */
const backPlanting = (x: Ctx): string => {
  const rnd = rng(91)
  const shrubs = newShrubs()
  for (const [px, py, w, flower] of [[-760, -236, 70, undefined], [392, -250, 60, '#fbf3f6'], [552, -226, 52, undefined]] as const) {
    addBush(shrubs, px, py, w, rnd, flower)
  }
  return drawShrubs(x, shrubs)
}

/** Planting inside the two activity bands, around the things the crab uses. */
const planting = (x: Ctx): string => {
  const rnd = rng(97)
  const shrubs = newShrubs()
  for (const [px, py, w, flower] of [[-964, -150, 84, '#f08fb0'], [966, -196, 74, '#f08fb0'], [1010, -120, 60, undefined]] as const) {
    addBush(shrubs, px, py, w, rnd, flower)
  }
  return (
    drawShrubs(x, shrubs) +
    rock(x, -944, -24, 62, 30, true) +
    rock(x, -900, -18, 30, 14) +
    rock(x, 560, -128, 40, 20, true) +
    rock(x, -790, -108, 36, 18) +
    irises(x, -610, -14, 5) +
    irises(x, 1010, -30, 6) +
    irises(x, -1100, -66, 8)
  )
}

const foreground = (x: Ctx): string => {
  const { g } = x
  const rnd = rng(53)
  let blades = ''
  for (let px = -WIDE; px < WIDE; px += 90 + rnd() * 110) {
    const at = R(px)
    blades += `M${at},4q-6,-18 -11,-30M${at + 4},4q0,-20 2,-37M${at + 8},4q6,-16 13,-27`
  }
  let s = `<path d="${blades}" stroke="${g('#4e8f50')}" stroke-width="3" fill="none" stroke-linecap="round"/>`
  for (const px of [-1064, 1050, -2000, 2060]) {
    s += `<g fill="${g('#4f9160')}"><path d="M${px},6q-44,-52 -12,-96q32,42 12,96z"/><path d="M${px + 36},6q-10,-62 30,-86q10,50 -30,86z"/></g><path d="M${px - 32},6q-46,-30 -40,-74q40,22 40,74z" fill="${g('#5fa56e')}"/>`
  }
  return s
}

const weatherFx = (x: Ctx): string => {
  const { v, c } = x
  let s = ''
  const rnd = rng(71)
  if (v.windy) {
    // Leaves and petals stream across the whole window on the wind.
    let leaves = ''
    let blown = ''
    for (let i = 0; i < 7; i++) {
      leaves += `M${R(rnd() * 880)},${R(rnd() * 500)}l10,-3`
      blown += `M${R(rnd() * 880)},${R(rnd() * 500)}l7,-2`
    }
    s += `<pattern id="lf" width="900" height="520" patternUnits="userSpaceOnUse" patternTransform="rotate(-10)">${speckle(leaves, x.g('#8fbf63'), 4.4)}${speckle(blown, c('#f7b9cd'), 4.4, 0.9)}</pattern><rect class="lf" x="-4000" y="-2700" width="9000" height="3200" fill="url(#lf)"/>`
  } else {
    // Petals fall through a box around each cherry tree: the big one by the bridge, the one behind the tea room.
    for (const [left, top, wide, tall, count] of [[-1090, -560, 600, 540, 7], [880, -540, 310, 330, 4]] as const) {
      let petals = ''
      for (let i = 0; i < count; i++) {
        const px = R(rnd() * wide)
        const py = rnd() * 450
        for (const dy of [-450, 0, 450]) {
          petals += `M${px},${R(py + dy)}l4,2`
        }
      }
      s += `<svg x="${left}" y="${top}" width="${wide}" height="${tall}"><path class="pt" d="${petals}" stroke="${c('#f7b9cd')}" stroke-width="4.5" stroke-linecap="round" fill="none" opacity=".9"/></svg>`
    }
  }
  let fallen = ''
  for (let i = 0; i < 24; i++) {
    fallen += `M${R(-1070 + rnd() * 500)},${R(-170 + rnd() * 160)}l4,1`
  }
  for (let i = 0; i < 16; i++) {
    fallen += `M${R(850 + rnd() * 330)},${R(-262 + rnd() * 84)}l4,1`
  }
  s += `<path d="${fallen}" stroke="${c('#f7c3d3')}" stroke-width="4" stroke-linecap="round" fill="none" opacity=".8"/>`
  if (v.windy) {
    s += '<path d="M-900,-640q60,-16 120,0t110,-4M420,-700q50,-13 100,0t90,-2M-560,-450q40,-11 80,0M760,-560q60,-13 110,2M-1400,-380q50,-12 96,0M1500,-470q60,-14 116,0" stroke="#fff" stroke-width="2.4" fill="none" opacity=".42" stroke-linecap="round"/>'
  }
  if (x.night > 0.5 && (v.weather === 'clear' || v.weather === 'cloudy')) {
    // Six small swarms, each wandering its own slow loop.
    const flies = ['', '', '', '', '', '']
    for (let i = 0; i < 18; i++) {
      const fx = R(i % 2 === 0 ? 420 + rnd() * 420 : -960 + rnd() * 560)
      const fy = R(-330 + rnd() * 270)
      flies[i % 6] += `<circle cx="${fx}" cy="${fy}" r="8" opacity=".22"/><circle cx="${fx}" cy="${fy}" r="2.3"/>`
    }
    s += `<g fill="#f1ff9a">${flies.map((swarm, i) => `<g class="f${i % 3}${i > 2 ? ' rv' : ''}"><g class="ff${i % 3 === 1 ? ' s2' : i % 3 === 2 ? ' s3' : ''}">${swarm}</g></g>`).join('')}</g>`
  }
  if (v.weather === 'fog') {
    s += `<g class="dr"><rect x="-3200" y="-340" width="6400" height="190" fill="url(#mi)"/><rect x="-3200" y="-210" width="6400" height="200" fill="url(#mi)" opacity=".8"/><rect x="-3200" y="-480" width="6400" height="170" fill="url(#mi)" opacity=".7"/></g>`
  }
  if (x.isWet) {
    for (const [px, py, prx] of [[-500, -22, 54], [520, -16, 46], [860, -58, 36], [-860, -30, 40], [1500, -60, 60], [-1700, -50, 60]] as const) {
      s += `<ellipse cx="${px}" cy="${py}" rx="${prx}" ry="${r1(prx * 0.18)}" fill="${mix(x.sky.low, c('#6f9fb5'), 0.45)}" opacity=".75"/>`
    }
  }
  return s
}

/** Weather that falls through the whole window, sky included. */
const precipitation = (x: Ctx): string => {
  let s = ''
  if (x.v.weather === 'fog') {
    s += `<rect width="100%" height="100%" fill="${mix(x.sky.low, '#ffffff', 0.4)}" opacity=".2"/>`
  }
  if (x.isWet) {
    s += '<rect class="rn" x="-15%" y="-30%" width="130%" height="140%" fill="url(#rn)"/>'
  }
  if (x.isSnowy) {
    s += '<rect class="sn" x="-5%" y="-90%" width="110%" height="195%" fill="url(#sn)"/>'
  }
  return s
}

/**
 * Everything that moves, slowly. Only transforms and opacity are animated, which a browser can do
 * without redrawing the picture, and the long loops all divide ten minutes, so a redraw on the
 * ten-minute marks picks each one up where it was.
 */
const motion = (v: GardenView): string => {
  const k = v.windy ? 2.2 : 1
  const wet = v.weather === 'rain' || v.weather === 'storm'
  const sway = (name: string, deg: number): string =>
    `@keyframes ${name}{0%,${v.windy ? 20 : 56}%,100%{transform:rotate(0)}${v.windy ? 36 : 66}%{transform:rotate(${r1(deg * k)}deg)}${v.windy ? 52 : 75}%{transform:rotate(${r1(-deg * k * 0.6)}deg)}${v.windy ? 68 : 84}%{transform:rotate(${r1(deg * k * 0.5)}deg)}${v.windy ? 84 : 93}%{transform:rotate(${r1(-deg * k * 0.2)}deg)}}`
  return (
    `.dr{animation:dr ${v.windy ? 300 : 600}s linear infinite}@keyframes dr{to{transform:translateX(${CLOUDS}px)}}` +
    '.tw,.ff{animation:tw 6s ease-in-out infinite alternate}@keyframes tw{from{opacity:.2}}' +
    '.ss{animation:ss 50s linear infinite}@keyframes ss{0%,96.5%{opacity:0;transform:translate(0,0)}97.5%{opacity:.9}100%{opacity:0;transform:translate(-340px,128px)}}' +
    '.f0{animation:f0 40s ease-in-out infinite}.f1{animation:f1 50s ease-in-out infinite}.f2{animation:f2 60s ease-in-out infinite}.rv{animation-direction:reverse;animation-duration:75s}' +
    '@keyframes f0{25%{transform:translate(46px,-28px)}50%{transform:translate(96px,10px)}75%{transform:translate(34px,34px)}}' +
    '@keyframes f1{20%{transform:translate(-40px,-20px)}50%{transform:translate(-84px,-44px)}80%{transform:translate(-30px,18px)}}' +
    '@keyframes f2{30%{transform:translate(28px,36px)}60%{transform:translate(-36px,22px)}85%{transform:translate(-18px,-24px)}}' +
    `.rn{animation:rn ${v.weather === 'storm' ? 0.6 : 1.2}s linear infinite}@keyframes rn{to{transform:translate(-46.6px,173.9px)}}` +
    '.sn{animation:sn 30s linear infinite}@keyframes sn{to{transform:translateY(600px)}}' +
    '.pt{animation:pt 30s linear infinite}@keyframes pt{to{transform:translateY(450px)}}' +
    '.lf{animation:lf 50s linear infinite}@keyframes lf{to{transform:translate(-886.3px,156.3px)}}' +
    '.bob{animation:bob 5s ease-in-out infinite}@keyframes bob{50%{transform:translateY(-2.5px)}}' +
    '.zz,.st{animation:zz 4s ease-in-out infinite}@keyframes zz{0%{opacity:0;transform:translateY(6px)}45%{opacity:.9}100%{opacity:0;transform:translateY(-10px)}}' +
    '.fl{animation:fl 3s ease-in-out infinite alternate}@keyframes fl{from{opacity:.6}}' +
    '.lt{animation:lt 10s linear infinite}@keyframes lt{0%,90%,95%,100%{opacity:0}91%,94%{opacity:.95}}' +
    `.sw,.sy{animation:sw ${v.windy ? 10 : 30}s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}.sy{animation-name:sy}${sway('sw', 1.1)}${sway('sy', 0.45)}` +
    '.s2{animation-delay:-11s}.s3{animation-delay:-19s}.s4{animation-delay:-27s}' +
    // Rings spread from where a drop or a fish broke the water: all the time in rain, now and then otherwise.
    `.rp{animation:${wet ? 'rr 2.4s' : 'rq 24s'} ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}` +
    '@keyframes rr{0%{transform:scale(.15);opacity:0}15%{opacity:1}100%{transform:scale(1.25);opacity:0}}' +
    '@keyframes rq{0%{transform:scale(.15);opacity:0}2%{opacity:1}16%,100%{transform:scale(1.5);opacity:0}}' +
    '.k0{animation:kk 75s linear infinite}.k1{animation:kk 60s linear infinite reverse}.k2{animation:kk 120s linear infinite}.k3{animation:kk 100s linear infinite reverse}@keyframes kk{to{transform:rotate(360deg)}}' +
    '.bk{animation:bk 6s linear infinite;transform-box:fill-box;transform-origin:50% 50%}@keyframes bk{0%,94%,100%{transform:scaleY(1)}97%{transform:scaleY(.1)}}' +
    '.bd{animation:bd 150s linear infinite;transform-box:fill-box;transform-origin:50% 50%}@keyframes bd{0%{transform:translate(-900px,-70px) scale(1.5);opacity:0}8%{opacity:1}45%{transform:translate(-330px,20px) scale(.95)}80%{opacity:1}100%{transform:translate(430px,175px) scale(.25);opacity:0}}' +
    // The other two keep loose company: a little ahead or behind, drifting wide and closing in again.
    '.b1{animation-name:b1;animation-delay:-5s}@keyframes b1{0%{transform:translate(-960px,-30px) scale(1.5);opacity:0}8%{opacity:1}30%{transform:translate(-520px,-48px) scale(1.2)}62%{transform:translate(-40px,96px) scale(.66)}82%{opacity:1}100%{transform:translate(400px,196px) scale(.25);opacity:0}}' +
    '.b2{animation-name:b2;animation-delay:-2s}@keyframes b2{0%{transform:translate(-850px,-110px) scale(1.5);opacity:0}8%{opacity:1}38%{transform:translate(-380px,36px) scale(1.08)}70%{transform:translate(70px,74px) scale(.56)}78%{opacity:1}100%{transform:translate(462px,158px) scale(.25);opacity:0}}' +
    // Eight beats, so no two plants (or rings) near each other move together.
    [0, 1, 2, 3, 4, 5, 6, 7].map(i => `.d${i}{animation-delay:${r1(-3.7 * i - (i % 3) * 5.3)}s}`).join('') +
    '@media (prefers-reduced-motion:reduce){*{animation:none!important}}'
  )
}

/** Centres the garden where asked and, in a window too narrow to show the crab, slides it into view. */
const placement = (crabX: number, shift: number, isFixed: boolean): string => {
  const at = crabX + shift
  const toward = at < 0 ? 1 : -1
  const reach = Math.abs(at) + 105
  let css = `#w{transform:translateX(${shift}px)}`
  if (isFixed) {
    for (let width = 2200; width >= 500; width -= 100) {
      const over = reach - (width - 50) / 2
      if (over > 0) {
        css += `@media (max-width:${width}px){#w{transform:translateX(${R(shift + toward * over)}px)}}`
      }
    }
  } else {
    for (const tenths of [20, 18, 16, 14, 12, 10, 8, 6]) {
      const over = reach - 45 * tenths
      if (over > 0) {
        css += `@media (max-aspect-ratio:${tenths}/10){#w{transform:translateX(${R(shift + toward * over)}px)}}`
      }
    }
  }
  return css
}

/** The whole scene as one SVG document. */
export const buildScene = (v: GardenView): string => {
  const x = makeCtx(v)
  const { sky, c, g } = x
  const glow = v.activity === 'lanterns' ? Math.max(sky.glow, 0.9) : sky.glow
  const sun = sunOf(x)
  const moon = moonOf(x)
  const act = activityArt(x)
  const house = teaHouse(x, glow)
  const water = [mix(sky.low, c('#86b9c8'), 0.55), mix(sky.top, c('#3e7d93'), 0.6)] as const
  const mist = mix(sky.low, '#ffffff', 0.55)
  const ceiling = shade(mix(sky.mid, sky.top, 0.35), 0.9 + x.night * 0.1)
  const fence = mix(c('#8a6a4c'), sky.low, 0.2)
  const rain = mix(sky.low, '#ffffff', 0.5)
  const stars = rng(11)
  const drops = rng(43)
  let rainPath = ''
  for (let i = 0; i < 9; i++) {
    rainPath += `M${R(drops() * 250)},${R(drops() * 150)}v30`
  }
  const defs =
    `<linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky.top}"/><stop offset=".46" stop-color="${sky.mid}"/><stop offset=".76" stop-color="${sky.low}"/></linearGradient>` +
    `<radialGradient id="sg"><stop offset="0" stop-color="${sun?.colour ?? '#ffffff'}" stop-opacity=".75"/><stop offset=".35" stop-color="${sun?.colour ?? '#ffffff'}" stop-opacity=".22"/><stop offset="1" stop-color="${sun?.colour ?? '#ffffff'}" stop-opacity="0"/></radialGradient>` +
    '<radialGradient id="wh"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="hl"><stop offset="0" stop-color="#ffd98a" stop-opacity=".7"/><stop offset=".5" stop-color="#ffc56a" stop-opacity=".22"/><stop offset="1" stop-color="#ffc56a" stop-opacity="0"/></radialGradient>' +
    `<linearGradient id="cv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ceiling}" stop-opacity=".55"/><stop offset="1" stop-color="${ceiling}" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="pw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${water[0]}"/><stop offset="1" stop-color="${water[1]}"/></linearGradient>` +
    `<linearGradient id="lw" gradientUnits="userSpaceOnUse" x1="0" y1="${HORIZON}" x2="0" y2="0"><stop offset="0" stop-color="${g('#97c981')}"/><stop offset="1" stop-color="${g('#5e9d5a')}"/></linearGradient>` +
    `<linearGradient id="mi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mist}" stop-opacity="0"/><stop offset=".5" stop-color="${mist}" stop-opacity=".62"/><stop offset="1" stop-color="${mist}" stop-opacity="0"/></linearGradient>` +
    `<pattern id="st" width="640" height="520" patternUnits="userSpaceOnUse">${speckle(dots(320, 260, 320, 260, 26, stars), '#fff', 2)}${speckle(dots(320, 260, 320, 260, 8, stars), '#fff', 3.6)}</pattern>` +
    `<pattern id="fc" width="24" height="26" patternUnits="userSpaceOnUse"><path d="M4,2V26M16,6V26M0,10H24M0,19H24" stroke="${fence}" stroke-width="2.4" fill="none"/></pattern>` +
    `<pattern id="rn" width="250" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(15)"><path d="${rainPath}" stroke="${rain}" stroke-width="${v.weather === 'storm' ? 2.2 : 1.7}" stroke-linecap="round" opacity=".5"/></pattern>` +
    `<pattern id="sn" width="700" height="600" patternUnits="userSpaceOnUse">${speckle(dots(350, 300, 350, 300, 38, drops), '#fff', 5, 0.9)}${speckle(dots(350, 300, 350, 300, 15, drops), '#fff', 8.5, 0.9)}</pattern>`
  const slot = (layer: string): string => (act.layer === layer ? act.svg : '')
  // Fixed: one unit is one pixel. Scaled: the old behaviour, the whole picture stretched to cover the window.
  const root = v.fixed
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">'
    : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1950 900" preserveAspectRatio="xMidYMax slice">'
  const frame = 'transform="translate(-378.8,-776.4) scale(.85)"'
  return (
    root +
    `<style>#a{overflow:visible}${placement(act.x, v.shift, v.fixed)}${v.motion ? motion(v) : ''}</style><defs>${defs}</defs>` +
    heavens(x, sun, moon) +
    '<svg id="a" x="50%" y="100%" overflow="visible"><g id="w">' +
    land(x) +
    hedgerow(x) +
    `<g class="sy d5">${cherry(x, 965, -258, 0.82, 23, CHERRY_SMALL)}</g>` +
    outskirts(x) +
    bamboo(x, 606, -256, 8, 290, 29) +
    `<g ${frame}>${house.back}</g>` +
    slot('house') +
    `<g ${frame}>${house.front}</g>` +
    backPlanting(x) +
    pond(x, sun ?? moon) +
    `<g transform="translate(-972,-859)">${isle(x)}</g>` +
    furnishings(x, glow) +
    `<g class="sy d2">${cherry(x, -830, -158, 1.04, 17, CHERRY_FULL)}</g>` +
    planting(x) +
    verges(x) +
    slot('main') +
    foreground(x) +
    weatherFx(x) +
    '</g></svg>' +
    precipitation(x) +
    '</svg>'
  )
}

const clock = (minute: number): string => `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`

/** The scene in words, for a reader who cannot see it and for /garden. */
export const describe = (v: GardenView): string => {
  const sky = v.weather === 'clear' ? 'a clear sky' : v.weather === 'cloudy' ? 'a few clouds' : v.weather === 'overcast' ? 'an overcast sky' : v.weather === 'storm' ? 'a thunderstorm' : v.weather
  return `A garden with a pond, a red bridge and a tea house at ${clock(v.minute)} under ${sky}${v.windy ? ', windy' : ''}. The crab is ${ACTIVITIES[v.activity] ?? 'resting'}.`
}
