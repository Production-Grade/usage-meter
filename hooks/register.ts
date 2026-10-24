import type { EngineInterface as Engine, Register } from 'claude-code'

// Spend you can see while it happens. Each session records its cost after every turn in the shared
// store, so the status line can show this session's $/hour next to every session's $/hour combined.

const BUDGET_PER_HOUR = 40 // all sessions together, in USD; a toast past this
const ALARM_EVERY_MS = 30 * 60_000
const WINDOW_MS = 60 * 60_000 // $/hour is measured over this window
const KEEP_SAMPLES_MS = 2 * 60 * 60_000
const FORGET_MS = 24 * 60 * 60_000
const CHURN_COMPACTS = 3 // this many compactions inside CHURN_MS means the context keeps refilling
const CHURN_MS = 30 * 60_000
const HAIKU_CONTEXT = 100_000 // Haiku costs 5x above a 100K prompt

type Row = { t: number; usd: number; model: string; ctx: number; samples: [number, number][] }

// Spend since the last sample at or before the window's start, over the time from then until now, so
// a session that goes idle decays towards zero instead of keeping its last rate.
const perHour = (samples: [number, number][], now: number) => {
  if (samples.length < 2) return 0
  const before = samples.filter(([t]) => now - t >= WINDOW_MS)
  const [t0, u0] = before[before.length - 1] ?? samples[0]!
  const [, u1] = samples[samples.length - 1]!
  const hours = Math.max((now - t0) / 3_600_000, 1 / 60)
  return (u1 - u0) / hours
}

const money = (usd: number) => (usd >= 100 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`)

const rows = async ($: Engine) => {
  const keys = (await $.store.keys()).filter(k => k.startsWith('s:'))
  const all = await Promise.all(keys.map(async k => [k.slice(2), (await $.store.get(k)) as Row] as const))
  return all.filter(([, r]) => r !== undefined)
}

export const register: Register = on => {
  let compacts: number[] = []

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'spend', description: 'Spend per session in $/hour, highest first' })
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId) return done
    const now = await $.clock.now()
    compacts = [...compacts.filter(t => now - t <= CHURN_MS), now]
    if (compacts.length >= CHURN_COMPACTS) {
      $.ui.toast(`${compacts.length} compactions in ${CHURN_MS / 60_000} min: the context refills fast. Look for big tool results or reads.`)
      compacts = []
    }
    return done
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    try {
      const [usage, model, sid, now] = await Promise.all([$.session.usage(), $.session.model(), $.session.id(), $.clock.now()])
      const usd = usage.cost?.usd
      if (usd === undefined) return done
      const ctx = usage.context.tokens ?? 0
      const was = (await $.store.get(`s:${sid}`)) as Row | undefined
      const samples = [...(was?.samples ?? []).filter(([t]) => now - t <= KEEP_SAMPLES_MS), [now, usd] as [number, number]]
      await $.store.set(`s:${sid}`, { t: now, usd, model, ctx, samples } satisfies Row)

      let all = 0
      for (const [id, r] of await rows($)) {
        if (now - r.t > FORGET_MS) await $.store.delete(`s:${id}`)
        else if (now - r.t <= KEEP_SAMPLES_MS) all += perHour(r.samples, now)
      }
      $.ui.status(`${money(usd)} · ${money(perHour(samples, now))}/h · all ${money(all)}/h`)

      const last = ((await $.store.get('alarm')) as number | undefined) ?? 0
      if (all > BUDGET_PER_HOUR && now - last > ALARM_EVERY_MS) {
        await $.store.set('alarm', now)
        $.ui.toast(`All sessions are spending ${money(all)}/h, over the ${money(BUDGET_PER_HOUR)}/h budget. /spend shows which.`)
      }
      if (/haiku/i.test(model) && ctx > HAIKU_CONTEXT) {
        $.ui.toast(`Haiku at ${Math.round(ctx / 1000)}K context costs 5x per token. Hand over and start fresh.`)
      }
    } catch (err) {
      $.ui.log(`no spend reading: ${String(err)}`)
    }
    return done
  })

  on('command.run', { command: 'spend' }, async $ => {
    const now = await $.clock.now()
    const live = (await rows($))
      .filter(([, r]) => now - r.t <= FORGET_MS)
      .map(([id, r]) => ({ id, r, rate: perHour(r.samples, now) }))
      .sort((a, b) => b.rate - a.rate || b.r.usd - a.r.usd)
    const lines = live.slice(0, 12).map(({ id, r, rate }) =>
      `${money(rate).padStart(7)}/h  ${money(r.usd).padStart(7)} total  ${String(Math.round(r.ctx / 1000)).padStart(4)}K ctx  ${r.model.replace(/^claude-/, '').padEnd(12)} ${id.slice(0, 8)}`)
    const total = live.reduce((s, x) => s + x.rate, 0)
    return {
      text: [
        `All sessions: ${money(total)}/h (budget ${money(BUDGET_PER_HOUR)}/h)`,
        ...(lines.length ? lines : ['No sessions recorded yet.']),
      ].join('\n'),
    }
  })
}
