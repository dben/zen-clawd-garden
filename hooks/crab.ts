import { mix } from './sky'
import type { Ctx } from './sky'

// The gardener: a small coral crab, drawn in its own space with its feet at
// (0, 0), about 68 wide and 60 tall. Each activity places it in the garden and
// draws its props in that same space.

/** Where a claw is: x, y, and which way its pincer opens, in degrees. */
type Arm = readonly [number, number, number]

type Pose = {
  eyes?: 'open' | 'closed' | 'happy' | 'up' | 'none'
  /** Left and right claws. */
  la?: Arm
  ra?: Arm
  isSitting?: boolean
  hat?: 'kasa' | 'low' | 'rain' | 'beret'
  /** Degrees of lean, and how far off the ground. */
  tilt?: number
  lift?: number
}

/** Which part of the garden the crab is drawn amongst. */
export type Layer = 'house' | 'main'

type Act = {
  at: readonly [number, number]
  scale?: number
  isFlipped?: boolean
  layer?: Layer
  pose: Pose
  /** Props behind and in front of the crab, in the crab's own space. */
  back?: string
  front?: string
  /** Art in the garden's space, drawn just before the crab. */
  world?: string
}

const crab = (x: Ctx, p: Pose): string => {
  const body = x.c('#de7e5c')
  const dark = x.c('#b85a3e')
  const light = x.c('#ec9c7e')
  const ink = x.c('#2b1b17')
  const d = p.isSitting === true ? 8 : 0
  const la = p.la ?? [-46, -30, -120]
  const ra = p.ra ?? [46, -30, -60]
  let s = ''
  for (const lx of [-27, -13, 5, 19]) {
    s += `<rect x="${lx}" y="${-14 + d}" width="8" height="${14 - d}" rx="3" fill="${dark}"/>`
  }
  s += `<path d="M-30,${-38 + d} L${la[0]},${la[1]} M30,${-38 + d} L${ra[0]},${ra[1]}" stroke="${dark}" stroke-width="9" stroke-linecap="round" fill="none"/>`
  s += `<rect x="-34" y="${-60 + d}" width="68" height="46" rx="14" fill="${body}"/>`
  s += `<rect x="-26" y="${-56 + d}" width="52" height="11" rx="5.5" fill="${light}" opacity=".5"/>`
  s += `<ellipse cx="-23" cy="${-30 + d}" rx="5" ry="3" fill="${x.c('#f4a3a0')}" opacity=".6"/><ellipse cx="23" cy="${-30 + d}" rx="5" ry="3" fill="${x.c('#f4a3a0')}" opacity=".6"/>`
  const eyes = p.eyes ?? 'open'
  if (eyes === 'open' || eyes === 'up') {
    const ey = (eyes === 'up' ? -55 : -51) + d
    s += `<g class="bk"><rect x="-17" y="${ey}" width="7" height="14" rx="3.5" fill="${ink}"/><rect x="10" y="${ey}" width="7" height="14" rx="3.5" fill="${ink}"/>`
    s += `<circle cx="-12.4" cy="${ey + 3.4}" r="1.5" fill="#fff" opacity=".85"/><circle cx="14.6" cy="${ey + 3.4}" r="1.5" fill="#fff" opacity=".85"/></g>`
  } else if (eyes !== 'none') {
    const bend = eyes === 'happy' ? -5 : 4
    const ey = (eyes === 'happy' ? -41 : -44) + d
    s += `<path d="M-18,${ey} q4.5,${bend} 9,0 M9,${ey} q4.5,${bend} 9,0" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
  }
  for (const arm of [la, ra]) {
    s += `<path transform="translate(${arm[0]},${arm[1]}) rotate(${arm[2]})" d="M0,0 L9.5,-5.5 A11,11 0 1,0 9.5,5.5 Z" fill="${body}"/>`
  }
  if (p.hat === 'kasa' || p.hat === 'low') {
    const hy = (p.hat === 'low' ? -42 : -55) + d
    s += `<path d="M-45,${hy} L0,${hy - 30} L45,${hy} Q0,${hy + 9} -45,${hy} Z" fill="${x.c('#e3c47c')}"/>`
    s += `<path d="M-24,${hy - 14} Q0,${hy - 9} 24,${hy - 14} M-34,${hy - 7} Q0,${hy} 34,${hy - 7}" stroke="${x.c('#c09a50')}" stroke-width="1.6" fill="none"/>`
  } else if (p.hat === 'rain') {
    s += `<path d="M-38,-53 Q-36,-82 0,-84 Q36,-82 38,-53 Q0,-61 -38,-53 Z" fill="${x.c('#f2c744')}"/><path d="M-46,-50 Q0,-64 46,-50" stroke="${x.c('#d9aa2c')}" stroke-width="6" fill="none" stroke-linecap="round"/>`
  } else if (p.hat === 'beret') {
    s += `<ellipse cx="-5" cy="-61" rx="24" ry="8" fill="${x.c('#3d4a6b')}"/><circle cx="-5" cy="-70" r="3" fill="${x.c('#3d4a6b')}"/>`
  }
  const lean = p.tilt === undefined && p.lift === undefined ? '' : ` transform="translate(0,${-(p.lift ?? 0)}) rotate(${p.tilt ?? 0})"`
  return `<g class="bob"><g${lean}>${s}</g></g>`
}

/** A koi seen through the water. */
export const koi = (x: Ctx, cx: number, cy: number, turn: number, hex: string, spot: string): string =>
  `<g transform="translate(${cx},${cy}) rotate(${turn})" opacity=".82"><ellipse rx="15" ry="5" fill="${x.c(hex)}"/><path d="M-13,0 l-11,-6 v12 z" fill="${x.c(hex)}"/><ellipse cx="3" cy="-1" rx="6" ry="3" fill="${x.c(spot)}"/></g>`

const note = (nx: number, ny: number, fill: string): string =>
  `<g transform="translate(${nx},${ny})"><ellipse rx="5" ry="3.6" transform="rotate(-20)" fill="${fill}"/><path d="M4.4,-1 V-18 q6,2 7,8" fill="none" stroke="${fill}" stroke-width="2" stroke-linecap="round"/></g>`

const snores = (x: Ctx, sx: number, sy: number): string => {
  return `<g class="zz" font-family="Georgia,serif" font-style="italic" font-weight="bold" fill="#fff" stroke="${x.c('#4a5070')}" stroke-width=".7"><text x="${sx}" y="${sy}" font-size="14">z</text><text x="${sx + 12}" y="${sy - 16}" font-size="18">z</text><text x="${sx + 27}" y="${sy - 36}" font-size="23">Z</text></g>`
}

const teacup = (x: Ctx): string =>
  `<path d="M33,-59 h17 l-2.5,13 h-12 z" fill="${x.c('#eef1e6')}"/><path class="st" d="M38,-64 q-4,-6 0,-12 q4,-6 0,-11 M46,-65 q-4,-5 0,-10" stroke="#fff" stroke-width="2" fill="none" opacity=".65" stroke-linecap="round"/>`

const ACTS: Record<string, (x: Ctx) => Act> = {
  meditate: () => ({
    at: [-520, -207],
    pose: { isSitting: true, eyes: 'closed', la: [-48, -24, -90], ra: [48, -24, -90] },
    world: '<g fill="none" stroke="#fff" opacity=".28"><ellipse cx="-492" cy="-158" rx="124" ry="26"/><ellipse cx="-492" cy="-156" rx="150" ry="33" opacity=".6"/></g>',
  }),

  stretch: x => ({
    at: [-492, -36],
    pose: { eyes: 'happy', la: [-42, -80, -100], ra: [42, -80, -80] },
    front: `<path d="M-66,-94 l-9,-9 M66,-94 l9,-9 M0,-104 v-13" stroke="${mix(x.sky.low, '#ffffff', 0.5)}" stroke-width="3.2" stroke-linecap="round" opacity=".85"/>`,
  }),

  water: x => ({
    at: [-520, -36],
    isFlipped: true,
    pose: { hat: 'kasa', ra: [50, -34, 0] },
    front:
      `<path d="M78,-34 L104,-52" stroke="${x.c('#7fa6b8')}" stroke-width="5" stroke-linecap="round"/><ellipse cx="106" cy="-54" rx="6.5" ry="4" transform="rotate(-35 106 -54)" fill="${x.c('#6b93a6')}"/>` +
      `<path d="M56,-52 q9,-15 19,0" stroke="${x.c('#6b93a6')}" stroke-width="3.5" fill="none"/><rect x="52" y="-52" width="27" height="27" rx="5" fill="${x.c('#7fa6b8')}"/>` +
      `<path d="M110,-46 l3,8 M117,-40 l3,8 M108,-30 l3,8 M119,-24 l3,8 M112,-14 l3,8 M122,-8 l3,8" stroke="${x.c('#a9dcf2')}" stroke-width="3" stroke-linecap="round"/>`,
  }),

  feedkoi: x => ({
    at: [-484, -68],
    pose: { eyes: 'happy', la: [-44, -36, -90], ra: [44, -66, -60] },
    front:
      `<path d="M-60,-42 h30 q0,15 -15,15 q-15,0 -15,-15 z" fill="${x.c('#ece5d2')}"/>` +
      `<path d="M56,-82 h0 M66,-94 h0 M78,-101 h0 M90,-103 h0 M101,-99 h0" stroke="${x.c('#e8c98a')}" stroke-width="4.5" stroke-linecap="round"/>`,
    world:
      koi(x, -330, -150, 150, '#f08a3c', '#fbf3e4') + koi(x, -296, -134, 200, '#fbf3e4', '#e8553c') + koi(x, -302, -166, 170, '#e8553c', '#fbf3e4') +
      '<g fill="none" stroke="#fff" opacity=".4"><ellipse cx="-325" cy="-150" rx="34" ry="9"/><ellipse cx="-325" cy="-150" rx="50" ry="14" opacity=".5"/></g>',
  }),

  rake: x => ({
    at: [712, -46],
    pose: { hat: 'kasa', ra: [46, -38, -30] },
    front:
      `<path d="M38,-76 L84,0" stroke="${x.c('#a47c4f')}" stroke-width="4" stroke-linecap="round"/><path d="M70,-5 L101,6" stroke="${x.c('#8a6540')}" stroke-width="5" stroke-linecap="round"/>` +
      `<path d="M72,-3 l-3,9 M79,-1 l-3,9 M86,1.5 l-3,9 M93,4 l-3,9 M99,6 l-3,9" stroke="${x.c('#8a6540')}" stroke-width="2.2" stroke-linecap="round"/>`,
  }),

  prune: x => ({
    at: [677, -176],
    isFlipped: true,
    pose: { ra: [48, -56, -10], la: [-44, -34, -110] },
    front: `<path d="M60,-40 l4,2 M68,-30 l-4,2 M56,-26 l4,1 M64,-16 l-3,2" stroke="${x.g('#6fae5f')}" stroke-width="3.4" stroke-linecap="round"/>`,
  }),

  sweep: x => ({
    at: [896, -132],
    pose: { ra: [44, -42, -40] },
    front:
      `<path d="M36,-82 L58,-10" stroke="${x.c('#b08a55')}" stroke-width="4" stroke-linecap="round"/><path d="M50,-15 L70,-12 L80,5 L45,2 Z" fill="${x.c('#d8b56a')}"/>` +
      `<path d="M54,-4 l-3,6 M62,-4 l0,7 M70,-3 l3,6" stroke="${x.c('#b8944e')}" stroke-width="1.6"/>` +
      `<path d="M88,2 h0 M96,-2 h0 M102,3 h0 M94,5 h0 M109,1 h0 M100,-5 h0 M114,5 h0" stroke="${x.c('#f5b3c8')}" stroke-width="5.5" stroke-linecap="round"/>`,
  }),

  picnic: x => ({
    at: [-790, -58],
    pose: { isSitting: true, eyes: 'happy', ra: [42, -46, -60] },
    back:
      `<path d="M-96,8 L80,8 L106,-10 L-70,-10 Z" fill="${x.c('#d96a5c')}"/>` +
      `<path d="M-62,8 l26,-18 M-12,8 l26,-18 M38,8 l26,-18" stroke="${x.c('#f3e6d0')}" stroke-width="4" opacity=".7"/>`,
    front:
      `<rect x="54" y="-13" width="31" height="13" rx="2" fill="${x.c('#3b2f2c')}"/><rect x="57" y="-11" width="11" height="7" fill="${x.c('#f4f0e6')}"/><rect x="71" y="-11" width="11" height="7" fill="${x.c('#e7a54a')}"/>` +
      `<path d="M44,-74 q8,0 14,14 q2,6 -6,6 h-16 q-8,0 -6,-6 q6,-14 14,-14 z" fill="${x.c('#fbf8f0')}"/><rect x="38" y="-60" width="12" height="7" fill="${x.c('#2d3a2f')}"/>` +
      `<rect x="-74" y="-14" width="13" height="11" rx="2.5" fill="${x.c('#8fb3a0')}"/>`,
  }),

  nap: x => ({
    at: [-905, -112],
    pose: { isSitting: true, eyes: 'none', hat: 'low', tilt: -5, la: [-40, -22, -100], ra: [40, -22, -80] },
    front: snores(x, 38, -66),
  }),

  fish: x => ({
    at: [484, -170],
    isFlipped: true,
    pose: { hat: 'kasa', ra: [46, -40, -40] },
    front:
      `<path d="M38,-34 L128,-112" stroke="${x.c('#8a6a45')}" stroke-width="3" stroke-linecap="round"/><path d="M128,-112 L134,32" stroke="#fff" stroke-width="1" opacity=".7"/>` +
      `<circle cx="134" cy="33" r="4.5" fill="${x.c('#e8553c')}"/><path d="M129.5,33 a4.5,4.5 0 0,0 9,0 z" fill="${x.c('#fbf3e4')}"/>` +
      '<g fill="none" stroke="#fff" opacity=".5"><ellipse cx="134" cy="37" rx="14" ry="4"/><ellipse cx="134" cy="37" rx="25" ry="7" opacity=".5"/></g>',
  }),

  paint: x => ({
    at: [496, -34],
    pose: { hat: 'beret', la: [-46, -36, -100], ra: [48, -60, -20] },
    front:
      `<ellipse cx="-56" cy="-40" rx="14" ry="10" fill="${x.c('#c9a26b')}"/><circle cx="-61" cy="-43" r="2.6" fill="${x.c('#e8553c')}"/><circle cx="-54" cy="-45" r="2.6" fill="${x.c('#5f9bd6')}"/><circle cx="-50" cy="-38" r="2.6" fill="${x.c('#f1c94a')}"/>` +
      `<path d="M64,0 L88,-102 M118,0 L94,-102 M91,-102 L91,-8" stroke="${x.c('#9a744a')}" stroke-width="4" stroke-linecap="round"/>` +
      `<rect x="62" y="-100" width="60" height="48" fill="${x.c('#fbf7ec')}" stroke="${x.c('#9a744a')}" stroke-width="2"/>` +
      `<path d="M68,-58 L88,-86 L99,-72 L107,-80 L117,-58 Z" fill="${x.c('#8fa3c9')}"/><circle cx="105" cy="-90" r="4.5" fill="${x.c('#e8765a')}"/>` +
      `<path d="M48,-60 L66,-70" stroke="${x.c('#3b2f2c')}" stroke-width="3" stroke-linecap="round"/>`,
  }),

  tea: x => ({
    at: [747, -226],
    scale: 1,
    pose: { isSitting: true, eyes: 'closed', ra: [42, -44, -60] },
    front:
      teacup(x) +
      `<rect x="-86" y="-4" width="46" height="4" rx="2" fill="${x.c('#8a5a3c')}"/><ellipse cx="-63" cy="-14" rx="14" ry="11" fill="${x.c('#6d5a4c')}"/>` +
      `<path d="M-50,-16 l10,-6 M-70,-25 q7,-9 14,0" stroke="${x.c('#6d5a4c')}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
  }),

  stones: x => ({
    at: [500, -38],
    pose: { ra: [58, -60, -70] },
    front:
      `<ellipse cx="72" cy="-6" rx="19" ry="7.5" fill="${x.c('#84858d')}"/><ellipse cx="72" cy="-18" rx="15" ry="6.5" fill="${x.c('#9b9ca3')}"/><ellipse cx="73" cy="-29" rx="11.5" ry="5.5" fill="${x.c('#7b7c85')}"/>` +
      `<ellipse cx="72" cy="-38" rx="8.5" ry="4.5" fill="${x.c('#a7a8ae')}"/><ellipse cx="69" cy="-48" rx="6" ry="3.6" fill="${x.c('#8d8e96')}"/>`,
  }),

  lanterns: x => ({
    at: [510, -173],
    pose: { ra: [44, -52, -30], eyes: 'up' },
    front: `<path d="M44,-52 L58,-62" stroke="${x.c('#c8b08a')}" stroke-width="2.6" stroke-linecap="round"/><circle cx="58" cy="-66" r="10" fill="#ffd98a" opacity=".45"/><path d="M58,-72 q4.5,5 0,10 q-4.5,-5 0,-10 z" fill="#ffcf5a"/>`,
  }),

  flute: x => {
    const ink = mix(x.c('#3a3340'), '#f6edd2', x.night)
    return {
      at: [-647, -217],
      pose: { isSitting: true, eyes: 'closed', la: [-40, -26, -90], ra: [40, -20, 0] },
      front: `<path d="M-4,-30 L52,-14" stroke="${x.c('#c9b07a')}" stroke-width="4.5" stroke-linecap="round"/><g class="st">${note(64, -64, ink)}${note(88, -88, ink)}${note(56, -104, ink)}</g>`,
    }
  },

  stargaze: x => ({
    at: [512, -34],
    pose: { eyes: 'up', ra: [44, -42, -40] },
    front:
      `<path d="M70,0 L85,-50 L100,0 M85,-50 V-6" stroke="${x.c('#6a5a4a')}" stroke-width="3.2" stroke-linecap="round" fill="none"/>` +
      `<path d="M62,-34 L112,-76" stroke="${x.c('#3f4f7a')}" stroke-width="11" stroke-linecap="round"/><path d="M109,-73.5 l7,-6" stroke="${x.c('#c9a24a')}" stroke-width="12" stroke-linecap="round"/>` +
      `<path d="M62,-34 l-8,6.5" stroke="${x.c('#2e3a5c')}" stroke-width="5.5" stroke-linecap="round"/>`,
    world: '<g class="tw"><path d="M640,-700 l-96,36" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".55"/><path d="M640,-714 l3,11 l11,3 l-11,3 l-3,11 l-3,-11 l-11,-3 l11,-3 z" fill="#fff" opacity=".95"/></g>',
  }),

  sleep: x => ({
    at: [794, -242],
    scale: 0.81,
    layer: 'house',
    pose: { isSitting: true, eyes: 'closed', la: [-36, -24, -90], ra: [36, -24, -90] },
    back: `<rect x="-36" y="-9" width="72" height="10" rx="4" fill="${x.c('#ece5d6')}"/>`,
    front:
      `<path d="M-37,-30 Q0,-40 37,-30 L38,1 H-38 Z" fill="${x.c('#5a6aa8')}"/><path d="M-22,-20 h0 M0,-24 h0 M22,-20 h0 M-11,-9 h0 M11,-9 h0" stroke="${x.c('#c9d2f2')}" stroke-width="4" stroke-linecap="round"/>` +
      snores(x, 22, -62),
  }),

  umbrella: x => ({
    at: [896, -132],
    pose: { eyes: 'happy', ra: [34, -62, -90] },
    front:
      `<path d="M34,-60 L34,-124" stroke="${x.c('#6a4a35')}" stroke-width="3.6" stroke-linecap="round"/>` +
      `<path d="M-38,-112 Q34,-180 106,-112 Q88,-123 70,-112 Q52,-123 34,-112 Q16,-123 -2,-112 Q-20,-123 -38,-112 Z" fill="${x.c('#d5483a')}"/>` +
      `<path d="M34,-145 L-2,-112 M34,-145 L70,-112 M34,-145 V-112" stroke="${x.c('#f3cfa6')}" stroke-width="1.6" opacity=".7"/><circle cx="34" cy="-148" r="3.4" fill="${x.c('#e3c47c')}"/>` +
      `<path d="M-44,-104 l-5,9 M112,-104 l5,9 M-30,-96 l-4,8 M100,-94 l4,8" stroke="${x.c('#cfe9f5')}" stroke-width="2.4" stroke-linecap="round"/>`,
  }),

  puddles: x => ({
    at: [-740, -34],
    pose: { eyes: 'happy', hat: 'rain', lift: 15, la: [-44, -70, -110], ra: [44, -70, -70] },
    back:
      `<ellipse cx="0" cy="4" rx="64" ry="12" fill="${mix(x.sky.low, x.c('#6f9fb5'), 0.45)}" opacity=".9"/>` +
      `<path d="M-48,0 q-14,-24 -30,-8 M48,0 q14,-24 30,-8 M-28,2 q-6,-20 -18,-24 M28,2 q6,-20 18,-24" stroke="${x.c('#d7eef8')}" stroke-width="3.2" fill="none" stroke-linecap="round"/>` +
      `<path d="M-84,-22 h0 M84,-22 h0 M-58,-34 h0 M58,-34 h0 M0,-2 h0" stroke="${x.c('#d7eef8')}" stroke-width="5" stroke-linecap="round"/>`,
  }),

  shelter: x => ({
    at: [747, -226],
    scale: 1,
    pose: { isSitting: true, eyes: 'up', ra: [42, -44, -60], la: [-36, -26, -90] },
    front: `<path d="M-37,-38 Q0,-26 37,-38 L39,-7 H-39 Z" fill="${x.c('#6a8f7a')}"/><path d="M-37,-38 Q0,-26 37,-38" stroke="${x.c('#8fb3a0')}" stroke-width="4" fill="none"/>` + teacup(x),
  }),

  kite: x => ({
    at: [-740, -36],
    pose: { eyes: 'up', tilt: -5, ra: [44, -72, -70] },
    world:
      '<path d="M-689,-119 Q-640,-380 -432,-528" stroke="#fff" stroke-width="1.3" fill="none" opacity=".85"/>' +
      `<g transform="translate(-420,-560) rotate(24)"><path d="M0,44 q-16,18 -2,36 q14,16 -2,34 q-12,14 -4,30" stroke="${x.c('#f3c14e')}" stroke-width="3.2" fill="none" stroke-linecap="round"/>` +
      `<path d="M0,-36 L25,0 L0,46 L-25,0 Z" fill="${x.c('#e0563f')}"/><path d="M0,-36 V46 M-25,0 H25" stroke="${x.c('#f7d9a8')}" stroke-width="1.8"/>` +
      `<circle cx="-8" cy="-6" r="2.6" fill="${x.c('#2b1b17')}"/><circle cx="8" cy="-6" r="2.6" fill="${x.c('#2b1b17')}"/></g>`,
  }),

  snowcrab: x => {
    const white = x.c('#f6f8fb')
    return {
      at: [482, -26],
      pose: { eyes: 'happy', ra: [46, -38, -20] },
      front:
        `<rect x="-34" y="-27" width="68" height="9" fill="${x.c('#c8483a')}"/><rect x="13" y="-21" width="9" height="19" rx="2" fill="${x.c('#b03c30')}"/>` +
        `<circle cx="58" cy="-39" r="9" fill="${white}"/>` +
        `<path d="M96,-8 v8 M116,-8 v8 M138,-8 v8" stroke="${white}" stroke-width="10" stroke-linecap="round"/><rect x="84" y="-52" width="68" height="46" rx="17" fill="${white}"/>` +
        `<circle cx="106" cy="-33" r="3.2" fill="${x.c('#2b1b17')}"/><circle cx="130" cy="-33" r="3.2" fill="${x.c('#2b1b17')}"/><path d="M111,-22 q7,5 14,0" stroke="${x.c('#2b1b17')}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
        `<path d="M85,-30 l-16,-13 m5,4 l-2,-9 M151,-30 l16,-13 m-5,4 l2,-9" stroke="${x.c('#6a4a35')}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    }
  },

  lanternwalk: x => ({
    at: [506, -36],
    pose: { hat: 'kasa', ra: [44, -50, -60] },
    front:
      `<circle class="fl" cx="62" cy="-72" r="64" fill="url(#hl)"/><path d="M44,-50 L62,-98 V-88" stroke="${x.c('#6a4a35')}" stroke-width="3" fill="none" stroke-linecap="round"/>` +
      '<ellipse cx="62" cy="-72" rx="11" ry="14" fill="#ffdc92"/><path d="M51,-72 h22 M53,-80 h18 M53,-64 h18" stroke="#e0a94a" stroke-width="1"/>' +
      `<rect x="57" y="-88" width="10" height="3" fill="${x.c('#3b2f2c')}"/><rect x="57" y="-59" width="10" height="3" fill="${x.c('#3b2f2c')}"/>`,
  }),
}

/** The crab at its current activity, placed in the garden. */
export const activityArt = (x: Ctx): { x: number; layer: Layer; svg: string } => {
  const make = ACTS[x.v.activity] ?? ACTS.tea
  if (make === undefined) {
    return { x: 500, layer: 'main', svg: '' }
  }
  // The crab and what it holds keep more of their own colour than the scenery does, so it reads at night.
  const soft: Ctx = { ...x, c: x.cc }
  const act = make(soft)
  const scale = act.scale ?? 1.15
  const flip = act.isFlipped === true ? -scale : scale
  return {
    x: act.at[0],
    layer: act.layer ?? 'main',
    svg: `${act.world ?? ''}<g transform="translate(${act.at[0]},${act.at[1]}) scale(${flip},${scale})">${act.back ?? ''}${crab(soft, act.pose)}${act.front ?? ''}</g>`,
  }
}
