import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { GardenOverride, GardenView, Weather } from '../types'
import { makeColors } from './make-colors.js'
import { lookFor } from './palette'
import { buildScene, describe } from './scene'
import { ACTIVITIES, moonPhase, pickActivity, sunTimes, weatherOf } from './sky'

// A crab tends a garden behind the conversation. Once a minute the mod works
// out the local time, reads the weather when its last reading is stale, and
// redraws the scene and the app's colours when either has moved on.

const SCENE = 'garden'
const view = atom({ plugin: 'zen-crab-garden', key: 'view' } as const, null, { shape: 'view-2' })
const override = atom({ plugin: 'zen-crab-garden', key: 'override' } as const, {}, { shape: 'override-1' })

/** One weather reading, kept in the store so every session shares it. */
type Report = { at: number; code: number; cloud: number; wind: number; gust: number; sunrise: number; sunset: number; offset: number }
/** Where the weather is read for: rounded to a tenth of a degree, about 10 km. */
type Place = { at: number; lat: number; lon: number; isManual: boolean }
type Veil = 'clear' | 'soft' | 'frosted'

const GLASS: Record<Veil, { blur: number; opacity: number }> = {
  clear: { blur: 0, opacity: 0.34 },
  soft: { blur: 3, opacity: 0.58 },
  frosted: { blur: 16, opacity: 0.72 },
}
const WEATHERS: readonly Weather[] = ['clear', 'cloudy', 'overcast', 'fog', 'rain', 'storm', 'snow']
const MINUTE = 60_000
const WEATHER_EVERY = 20 * MINUTE
const PLACE_EVERY = 7 * 24 * 60 * MINUTE

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** "2026-11-17T06:32" as minutes since midnight. */
const minuteOf = (iso: unknown): number | null =>
  typeof iso === 'string' && /T\d\d:\d\d/.test(iso) ? Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) : null

const asReport = (value: unknown): Report | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const r = value as Record<string, unknown>
  const [at, code, cloud, wind, gust, sunrise, sunset, offset] = [r.at, r.code, r.cloud, r.wind, r.gust, r.sunrise, r.sunset, r.offset].map(num)
  if (at == null || code == null || cloud == null || wind == null || gust == null || sunrise == null || sunset == null || offset == null) {
    return null
  }
  return { at, code, cloud, wind, gust, sunrise, sunset, offset }
}

const asPlace = (value: unknown): Place | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const p = value as Record<string, unknown>
  const [at, lat, lon] = [p.at, p.lat, p.lon].map(num)
  return at == null || lat == null || lon == null ? null : { at, lat, lon, isManual: p.isManual === true }
}

const clock = (minute: number): string => `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`

// What the mod knows between ticks. A reload starts it over; the store and `$.state` fill it back in.
const S = {
  report: null as Report | null,
  place: null as Place | null,
  isMoving: true,
  veil: 'soft' as Veil,
  isFixed: true,
  shift: 0,
  lookKey: '',
  drawn: '',
  isFetching: false,
  lastTry: 0,
  scene: { key: '', svg: '' },
}

/** Where to read the weather for: the person's own setting, else a rough fix from the network address. */
const locate = async ($: EngineInterface, now: number): Promise<Place | null> => {
  if (S.place !== null && (S.place.isManual || now - S.place.at < PLACE_EVERY)) {
    return S.place
  }
  for (const url of ['https://ipwho.is/', 'https://get.geojs.io/v1/ip/geo.json']) {
    try {
      const answer = await $.http.fetch(url)
      if (!answer.ok) {
        continue
      }
      const data = JSON.parse(answer.text) as { latitude?: unknown; longitude?: unknown }
      const lat = Number(data.latitude ?? Number.NaN)
      const lon = Number(data.longitude ?? Number.NaN)
      if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
        S.place = { at: now, lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10, isManual: false }
        await $.store.set('place', S.place)
        return S.place
      }
    } catch {
      // The next service may answer.
    }
  }
  return S.place
}

const forecast = async ($: EngineInterface, now: number): Promise<void> => {
  const at = await locate($, now)
  if (at === null) {
    return
  }
  const answer = await $.http.fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${at.lat}&longitude=${at.lon}&current=weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m&daily=sunrise,sunset&timezone=auto&forecast_days=1`,
  )
  if (!answer.ok) {
    return
  }
  const data = JSON.parse(answer.text) as {
    utc_offset_seconds?: unknown
    current?: Record<string, unknown>
    daily?: { sunrise?: unknown[]; sunset?: unknown[] }
  }
  const code = num(data.current?.weather_code)
  const offset = num(data.utc_offset_seconds)
  const sunrise = minuteOf(data.daily?.sunrise?.[0])
  const sunset = minuteOf(data.daily?.sunset?.[0])
  if (code === null || offset === null || sunrise === null || sunset === null) {
    return
  }
  S.report = {
    at: now,
    code,
    cloud: num(data.current?.cloud_cover) ?? 0,
    wind: num(data.current?.wind_speed_10m) ?? 0,
    gust: num(data.current?.wind_gusts_10m) ?? 0,
    sunrise,
    sunset,
    offset,
  }
  await $.store.set('report', S.report)
}

const viewAt = (now: number, forced: GardenOverride): GardenView => {
  const r = S.report
  const offset = r?.offset ?? -new Date(now).getTimezoneOffset() * 60
  const local = Math.floor((now / 1000 + offset) / 60)
  const live = ((local % 1440) + 1440) % 1440
  // A reading older than three hours says little about the sky now.
  const fresh = r !== null && now - r.at < 180 * MINUTE ? r : null
  // Each redraw swaps the whole picture, which shows as a blink, so the sky moves on in as few
  // steps as it can: every ten minutes while the light is changing, every half hour otherwise.
  const { rise, set } = sunTimes({ sunrise: r?.sunrise ?? 390, sunset: r?.sunset ?? 1110 })
  const step = Math.abs(live - rise) < 80 || Math.abs(live - set) < 80 ? 10 : 30
  const base = {
    minute: forced.minute ?? Math.floor(live / step) * step,
    sunrise: r?.sunrise ?? 390,
    sunset: r?.sunset ?? 1110,
    weather: forced.weather ?? (fresh === null ? 'clear' : weatherOf(fresh.code, fresh.cloud)),
    windy: forced.windy ?? (fresh !== null && (fresh.wind >= 28 || fresh.gust >= 45)),
  }
  return { ...base, moon: Math.round(moonPhase(now) * 50) / 50, activity: forced.activity ?? pickActivity(base), motion: S.isMoving, fixed: S.isFixed, shift: S.shift }
}

/** Sets the theme when the colours or the veil changed, and not otherwise. */
const dress = async ($: EngineInterface, v: GardenView): Promise<void> => {
  const look = lookFor(v)
  const key = look.key + S.veil
  if (key === S.lookKey) {
    return
  }
  const { theme, problems } = makeColors(look.definition)
  const isPainted = !problems.some(line => line.startsWith("Desktop won't paint"))
  const args: ThemeSetArgs = { backdrop: { scene: SCENE, glass: GLASS[S.veil] }, ...(isPainted ? { colors: theme } : {}) }
  await $.theme.set(args)
  S.lookKey = key
}

const paint = async ($: EngineInterface): Promise<GardenView> => {
  const now = await $.clock.now()
  const next = viewAt(now, await read($, override))
  const json = JSON.stringify(next)
  if (json !== S.drawn) {
    S.drawn = json
    await update($, view, () => next)
  }
  await dress($, next)
  return next
}

const refresh = async ($: EngineInterface): Promise<void> => {
  const now = await $.clock.now()
  const isDue = S.report === null || now - S.report.at > WEATHER_EVERY
  if (isDue && !S.isFetching && now - S.lastTry > 2 * MINUTE) {
    S.isFetching = true
    S.lastTry = now
    // Never wait on the network to draw: the scene catches up when the reading lands.
    void forecast($, now)
      .catch(() => undefined)
      .then(() => {
        S.isFetching = false
        return paint($)
      })
      .catch(() => undefined)
  }
  await paint($)
}

const TIMES: Record<string, (rise: number, set: number) => number> = {
  dawn: rise => rise - 30,
  sunrise: rise => rise,
  morning: rise => rise + 120,
  noon: (rise, set) => (rise + set) / 2,
  afternoon: (_, set) => set - 150,
  golden: (_, set) => set - 45,
  sunset: (_, set) => set,
  dusk: (_, set) => set + 35,
  evening: (_, set) => set + 100,
  night: () => 22 * 60,
  midnight: () => 60,
}

const savePrefs = ($: EngineInterface): Promise<void> => $.store.set('prefs', { v: 2, motion: S.isMoving, veil: S.veil, layout: S.isFixed ? 'fixed' : 'scaled', shift: S.shift })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      S.report = asReport(await $.store.get('report'))
      S.place = asPlace(await $.store.get('place'))
      const prefs = await $.store.get('prefs')
      if (typeof prefs === 'object' && prefs !== null) {
        const kept = prefs as { motion?: unknown; veil?: unknown; layout?: unknown; shift?: unknown; v?: unknown }
        // Motion came on by default with the second version of these settings.
        S.isMoving = kept.v === 2 ? kept.motion === true : true
        S.veil = kept.veil === 'clear' || kept.veil === 'frosted' ? kept.veil : 'soft'
        S.isFixed = kept.layout !== 'scaled'
        S.shift = num(kept.shift) ?? 0
      }
      await $.command.register({
        name: 'garden',
        description: 'The crab garden: what it shows, previews, motion, veil, layout and location',
        argumentHint: '[status | list | preview <what> | live | motion on|off | veil clear|soft|frosted | center <px> | layout fixed|scaled | location auto|<lat> <lon>]',
      })
      await refresh($)
      $.clock.every(MINUTE, () => {
        void refresh($).catch(() => undefined)
      })
    } catch (error) {
      $.ui.log(`zen-crab-garden could not start: ${String(error)}`, { to: 'debug' })
    }
    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.props.scene !== SCENE || (e.surface !== 'desktop' && e.surface !== 'mobile')) {
      return next(e)
    }
    const v = await read($, view)
    if (v === null) {
      return next(e)
    }
    const key = JSON.stringify(v)
    if (S.scene.key !== key) {
      S.scene = { key, svg: buildScene(v) }
    }
    const { Svg } = $.ui.resolve(e)

    return <Svg source={S.scene.svg} alt={describe(v)} />
  })

  on('command.run', { command: 'garden' }, async ($, e) => {
    const [verb = 'status', ...rest] = e.args.trim().toLowerCase().split(/[\s,]+/).filter(word => word !== '')

    if (verb === 'list') {
      const things = Object.entries(ACTIVITIES).map(([id, label]) => `  ${id}: ${label}`)
      return {
        text: `The crab's activities:\n${things.join('\n')}\n\nPreview any of them, a weather (${WEATHERS.join(', ')}, windy) or a time (14:30, ${Object.keys(TIMES).join(', ')}): /garden preview rain dusk`,
      }
    }

    if (verb === 'preview') {
      const { rise, set } = sunTimes({ sunrise: S.report?.sunrise ?? 390, sunset: S.report?.sunset ?? 1110 })
      const forced: GardenOverride = {}
      for (const word of rest) {
        const time = /^(\d{1,2}):(\d\d)$/.exec(word)
        const named = TIMES[word]
        if (time !== null) {
          forced.minute = (Number(time[1]) % 24) * 60 + (Number(time[2]) % 60)
        } else if (named !== undefined) {
          forced.minute = Math.round(named(rise, set))
        } else if (word === 'windy' || word === 'calm') {
          forced.windy = word === 'windy'
        } else if ((WEATHERS as readonly string[]).includes(word)) {
          forced.weather = word as Weather
        } else if (word in ACTIVITIES) {
          forced.activity = word
        } else {
          return { text: `"${word}" is not something the garden knows. /garden list shows what it does.` }
        }
      }
      if (rest.length === 0) {
        return { text: 'Say what to preview: an activity, a weather or a time, such as /garden preview fish, /garden preview snow or /garden preview storm 21:00.' }
      }
      await update($, override, () => forced)
      const shown = await paint($)
      return { text: `Previewing: ${describe(shown)} /garden live goes back to the real sky.` }
    }

    if (verb === 'live') {
      await update($, override, () => ({}))
      return { text: `Back to the real sky. ${describe(await paint($))}` }
    }

    if (verb === 'motion') {
      S.isMoving = rest[0] === 'on' ? true : rest[0] === 'off' ? false : !S.isMoving
      await savePrefs($)
      await paint($)
      return { text: S.isMoving ? 'Motion is on: clouds drift, stars twinkle, fireflies wander, rain and petals fall, and the plants stir in the breeze.' : 'Motion is off: the garden is a still picture.' }
    }

    if (verb === 'veil') {
      const want = rest[0]
      if (want !== 'clear' && want !== 'soft' && want !== 'frosted') {
        return { text: `The veil over the garden is ${S.veil}. Choose one: /garden veil clear (most garden), soft, or frosted (calmest behind text).` }
      }
      S.veil = want
      await savePrefs($)
      await paint($)
      return { text: `The veil is now ${S.veil}.` }
    }

    if (verb === 'center' || verb === 'centre') {
      const px = Number(rest[0])
      if (rest.length !== 1 || !Number.isFinite(px) || Math.abs(px) > 1500) {
        return { text: `The garden is centred ${S.shift} px right of the window's middle. A mod cannot see where the conversation sits, so nudge it to match: /garden center 140 moves it 140 px right, /garden center -200 moves it left, /garden center 0 puts it back.` }
      }
      S.shift = Math.round(px)
      await savePrefs($)
      await paint($)
      return { text: `The garden is now centred ${S.shift} px ${S.shift < 0 ? 'left' : 'right'} of the window's middle.` }
    }

    if (verb === 'layout') {
      if (rest[0] !== 'fixed' && rest[0] !== 'scaled') {
        return { text: `The layout is ${S.isFixed ? 'fixed' : 'scaled'}. /garden layout fixed keeps the horizon 300 px up and lets the sky stretch; /garden layout scaled stretches the whole picture to cover the window.` }
      }
      S.isFixed = rest[0] === 'fixed'
      await savePrefs($)
      await paint($)
      return { text: `The layout is now ${rest[0]}.` }
    }

    if (verb === 'location') {
      const lat = Number(rest[0])
      const lon = Number(rest[1])
      const now = await $.clock.now()
      if (rest[0] === 'auto') {
        S.place = null
        await $.store.delete('place')
      } else if (rest.length === 2 && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        S.place = { at: now, lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10, isManual: true }
        await $.store.set('place', S.place)
      } else {
        return { text: 'Give a latitude and longitude, such as /garden location 35.0 135.8, or /garden location auto to find it from your network address.' }
      }
      S.report = null
      S.lastTry = 0
      await refresh($)
      return { text: S.place === null ? 'Finding your location from your network address; the weather follows in a moment.' : `Weather is now read for ${S.place.lat}, ${S.place.lon}; it follows in a moment.` }
    }

    const shown = await paint($)
    const now = await $.clock.now()
    const where = S.place === null ? 'no location yet' : `${S.place.lat}, ${S.place.lon} (${S.place.isManual ? 'set by you' : 'from your network address'})`
    const reading = S.report === null ? 'No weather reading yet, so a clear sky is assumed.' : `Weather read ${Math.max(0, Math.round((now - S.report.at) / MINUTE))} min ago for ${where}; sunrise ${clock(S.report.sunrise)}, sunset ${clock(S.report.sunset)}.`
    const forced = await read($, override)
    return {
      text: `${describe(shown)}\n${reading}\n${Object.keys(forced).length > 0 ? 'This is a preview; /garden live goes back to the real sky.\n' : ''}Motion ${S.isMoving ? 'on' : 'off'}, veil ${S.veil}, layout ${S.isFixed ? 'fixed' : 'scaled'}, centred ${S.shift} px from the middle. Try /garden list, /garden preview rain, /garden motion on, /garden veil clear.`,
    }
  })
}
