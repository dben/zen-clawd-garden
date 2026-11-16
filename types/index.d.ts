export type Weather = 'clear' | 'cloudy' | 'overcast' | 'fog' | 'rain' | 'storm' | 'snow'

/** Everything the scene is drawn from. Plain data, so it can live in `$.state`. */
export type GardenView = {
  /** Local minutes since midnight, 0 to 1439. */
  minute: number
  /** Local minutes since midnight of today's sunrise and sunset. */
  sunrise: number
  sunset: number
  weather: Weather
  /** Stronger than a breeze: leaves fly and the bamboo leans. */
  windy: boolean
  /** Moon phase, 0 new, 0.5 full. */
  moon: number
  /** What the crab is doing, a key of ACTIVITIES. */
  activity: string
  /** Ambient animation on or off. */
  motion: boolean
  /** True: one unit is one pixel and the horizon stays 300 px up. False: the picture scales to cover the window. */
  fixed: boolean
  /** How far right of the window's middle the scene is centred, in pixels. */
  shift: number
}

/** A preview the person asked for with /garden preview; empty means live. */
export type GardenOverride = {
  minute?: number
  weather?: Weather
  windy?: boolean
  activity?: string
}

declare module 'claude-code' {
  interface PluginState {
    'zen-clawd-garden': {
      view: Shaped<GardenView | null>
      override: Shaped<GardenOverride>
    }
  }
}
