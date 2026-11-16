import { expect, mock, test } from 'claude-code/testing'
import type { CommandRunInput, On } from 'claude-code'

const BACKDROP = {
  plugin: 'zen-clawd-garden',
  component: 'Backdrop',
  requestId: 'backdrop',
  props: { scene: 'garden', plugin: 'zen-clawd-garden', glass: false },
} as const

// 20:00 UTC is noon where the forecast below says the garden is (UTC-8).
const NOON = Date.UTC(2026, 10, 16, 20, 0)

const forecast = (code: number): string =>
  JSON.stringify({
    utc_offset_seconds: -28800,
    current: { weather_code: code, cloud_cover: code === 0 ? 5 : 100, wind_speed_10m: 8, wind_gusts_10m: 15 },
    daily: { sunrise: ['2026-11-16T07:10'], sunset: ['2026-11-16T16:35'] },
  })

/** `/garden <args>` as the person typing it. */
const garden = (args: string): CommandRunInput => ({
  command: 'garden',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
})

/** Stands for the engine beneath the mod: a clock, a store, the network and the theme. */
const world = (on: On, code: number): { themes: unknown[] } => {
  const themes: unknown[] = []
  mock.clock(on, { now: NOON })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'garden' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('theme.set', (_, e) => {
    themes.push(e)
    return { value: { isDrawn: true, requestId: 'backdrop' } }
  })
  on('http.fetch', (_, e) => ({
    value: {
      status: 200,
      ok: true,
      headers: {},
      text: e.url.includes('open-meteo') ? forecast(code) : '{"latitude":35.04,"longitude":135.77}',
    },
  }))
  return { themes }
}

test('the garden draws the hour and the weather behind the conversation', async ($, on) => {
  const { themes } = world(on, 63)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BACKDROP, surface })
    const scene = await ui.find({ type: 'Svg' })
    const source = String(scene?.props.source)
    expect(source.startsWith('<svg')).toBe(true)
    expect(source.length).toBeLessThan(131072)
    // Rain was forecast, so it rains at noon and the crab is out in it.
    expect(String(scene?.props.alt)).toMatch(/12:00 under rain/)
    await ui.unmount()
  }

  expect(themes.length).toBeGreaterThan(0)
  expect(JSON.stringify(themes.at(-1))).toMatch(/"scene":"garden"/)
  expect(JSON.stringify(themes.at(-1))).toMatch(/"inputs"/)
})

test('a preview shows what was asked for, and live goes back', async ($, on) => {
  world(on, 0)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const preview = await $.command.run(garden('preview snow 21:00 snowcrab'))
  expect(preview.text).toMatch(/21:00 under snow.*building a snow crab/)

  const ui = await $.ui.mount({ ...BACKDROP, surface: 'desktop' })
  expect(String((await ui.find({ type: 'Svg' }))?.props.alt)).toMatch(/21:00 under snow/)
  await ui.unmount()

  const live = await $.command.run(garden('live'))
  expect(live.text).toMatch(/12:00 under a clear sky/)
})

test('every activity and weather draws within the size a scene may be', async ($, on) => {
  world(on, 0)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const listed = await $.command.run(garden('list'))
  const activities = [...String(listed.text).matchAll(/^ {2}(\w+):/gm)].map(match => match[1] ?? '')
  expect(activities.length).toBeGreaterThan(11)

  for (const activity of activities) {
    for (const sky of ['storm windy 13:00', 'snow 23:30', 'cloudy 22:00']) {
      await $.command.run(garden(`preview ${activity} ${sky}`))
      const ui = await $.ui.mount({ ...BACKDROP, surface: 'desktop' })
      const source = String((await ui.find({ type: 'Svg' }))?.props.source)
      expect(source.length).toBeGreaterThan(10000)
      expect(source.length).toBeLessThan(131072)
      expect(source.includes('NaN') || source.includes('undefined')).toBe(false)
      await ui.unmount()
    }
  }
})

test('the layout and the centre can be set, and are remembered in the picture', async ($, on) => {
  world(on, 0)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const draw = async (): Promise<string> => {
    const ui = await $.ui.mount({ ...BACKDROP, surface: 'desktop' })
    const source = String((await ui.find({ type: 'Svg' }))?.props.source)
    await ui.unmount()
    return source
  }

  // Fixed by default: no viewBox, so a unit is a pixel and the horizon stays put.
  expect(await draw()).not.toMatch(/viewBox/)

  await $.command.run(garden('center 140'))
  expect(await draw()).toMatch(/#w\{transform:translateX\(140px\)\}/)

  await $.command.run(garden('layout scaled'))
  expect(await draw()).toMatch(/viewBox="0 0 1950 900"/)
})
