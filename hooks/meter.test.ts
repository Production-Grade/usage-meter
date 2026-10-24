import { expect, test } from 'claude-code/testing'

test('a turn records spend and shows it in the status line', async ($, on) => {
  const store = new Map<string, unknown>()
  let status: string | undefined
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 50_000, window: 1_000_000 }, rateLimits: [], cost: { usd: 3.5 } } as never }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.id', () => ({ value: 'abc12345' }))
  on('clock.now', () => ({ value: 3_600_000 }))
  on('store.get', (_, e) => ({ value: store.get(e.key) as never }))
  on('store.set', (_, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.delete', (_, e) => { store.delete(e.key); return { value: undefined } })
  on('ui.status', (_, e) => { status = e.text; return { value: undefined } })
  on('ui.toast', () => ({ value: undefined as never }))
  on('ui.log', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }) as never)
  store.set('s:abc12345', { t: 1_800_000, usd: 1.5, model: 'claude-opus-5-5', ctx: 40_000, samples: [[1_800_000, 1.5]] })
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false } as never)
  expect(status).toBe('$3.50 · $4.00/h · all $4.00/h')
})
