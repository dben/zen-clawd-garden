import type { GardenView } from '../types'
import { mix, skyAt } from './sky'

// The app's own colours, taken from the sky: a page tinted by the hour in each
// mode, and an accent that goes from dawn coral through garden green to night
// periwinkle. `makeColors` turns these few seeds into the whole palette.

type Anchors = {
  'surface-0': string
  'surface-1': string
  'surface-2': string
  'surface-3'?: string
  'text-primary': string
  'text-secondary': string
  'text-muted': string
}

export type Look = {
  /** Changes only when the colours do, so the theme is set no more often than that. */
  key: string
  definition: {
    label: string
    roles: { accent: string; danger: string; success: string; warning: string; pro: string }
    light: { gray: { anchors: Anchors } }
    dark: { gray: { anchors: Anchors } }
  }
}

export const lookFor = (v: Pick<GardenView, 'minute' | 'sunrise' | 'sunset' | 'weather'>): Look => {
  // The app's colours move in quarter-hour steps; the sky itself moves more finely.
  const sky = skyAt({ ...v, minute: Math.round(v.minute / 15) * 15 })
  const { paperL, paperD, accent } = sky
  return {
    key: `${paperL}${paperD}${accent}`,
    definition: {
      label: 'Crab garden',
      roles: { accent, danger: '#c0473a', success: '#4e8a4a', warning: '#b9822a', pro: '#8466b8' },
      light: {
        gray: {
          anchors: {
            'surface-0': paperL,
            'surface-1': mix(paperL, '#ffffff', 0.4),
            'surface-2': mix(paperL, '#ffffff', 0.72),
            'text-primary': mix(paperD, '#000000', 0.2),
            'text-secondary': mix(paperD, paperL, 0.2),
            'text-muted': mix(paperD, paperL, 0.33),
          },
        },
      },
      dark: {
        gray: {
          anchors: {
            'surface-0': paperD,
            'surface-1': mix(paperD, '#ffffff', 0.04),
            'surface-2': mix(paperD, '#ffffff', 0.07),
            'surface-3': mix(paperD, '#ffffff', 0.085),
            'text-primary': mix(paperL, '#ffffff', 0.35),
            'text-secondary': mix(paperL, paperD, 0.2),
            'text-muted': mix(paperL, paperD, 0.3),
          },
        },
      },
    },
  }
}
