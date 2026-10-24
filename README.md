# usage-meter

A Claude Code mod that shows what you're spending while you spend it. The status line shows this
session's spend, its $/hour, and every open session's $/hour combined.

```
$12.40 · $8.10/h · all $23.60/h
```

## Why

Spend you only see on the invoice can't be fixed. Most of it goes on patterns you'd stop at once
if you saw them: a session whose context keeps refilling, three agents left running, Haiku
working at 300K context. usage-meter shows the rate as it happens and flags those patterns.

## What it does

- **Status line**: the session's total spend, its $/hour over the last hour, and all sessions'
  $/hour.
- **Budget toast** when all sessions together pass $40/hour, at most once every 30 minutes.
- **Churn toast** at three compactions in 30 minutes. The context is refilling fast, usually from
  big tool results or whole-file reads.
- **Haiku toast** when Haiku runs past 100K context, where it costs 5x per token.
- **`/spend`** ranks open sessions by $/hour, with total spend, context size and model. If
  [output-offload](https://github.com/Production-Grade/output-offload) is installed, it also
  shows what that mod kept out of context.

Sessions share their readings through the mod's own store, so any session can see the rest.
Nothing leaves your machine.

## Install

```
/plugin marketplace add Production-Grade/usage-meter
/plugin install usage-meter@usage-meter
```

## Settings

Constants at the top of [`hooks/register.ts`](hooks/register.ts):

| Constant | Default | What it does |
|---|---|---|
| `BUDGET_PER_HOUR` | `40` | USD per hour across all sessions before the budget toast |
| `ALARM_EVERY_MS` | 30 min | Least time between budget toasts |
| `WINDOW_MS` | 60 min | Window the $/hour is measured over |
| `CHURN_COMPACTS` / `CHURN_MS` | 3 in 30 min | What counts as compaction churn |
| `HAIKU_CONTEXT` | `100_000` | Haiku context size that triggers the warning |

Spend comes from Claude Code's own cost figure for the session, at API prices. On a subscription,
read it as relative usage.

Part of [Claude Lean Mods](https://github.com/Production-Grade/claude-lean-mods). MIT licence.
