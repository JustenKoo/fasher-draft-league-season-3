# Fasher Draft League — Feature Backlog

Ideas that have been discussed but not built. This is a place to park
brainstorming so it isn't lost, not a spec — an entry here means "worth
picking up later and scoping properly," not "designed and ready to
implement." When starting one, treat it as the beginning of a fresh scoping
conversation.

## Battle turn-restart / rollback admin command

**Idea:** a global admin command that could restart/resume a battle from a
specific past turn (e.g. turn 7) — for a server crash, a player's internet
going down mid-battle, or another extenuating circumstance.

**Status:** exploratory only, not scoped. Open questions from the initial
discussion:

- **What it's actually for matters a lot, and wasn't pinned down.** "Internet
  dropped mid-battle" and "undo a turn because of a real-world extenuating
  circumstance" are very different features with very different fairness
  implications - the first is a reconnect problem, the second is a rewrite-
  history problem. The reconnect case is now separately covered (see
  [FASHER-TECH-DESIGN.md](./FASHER-TECH-DESIGN.md#connecting--logging-in) -
  a dropped connection no longer loses your seat in the battle, since the
  IP-locked reconnect bug was fixed). What's left unaddressed is only the
  "actually roll back a completed turn" case.
- **How feasible, technically:** more feasible than it first sounds, and
  *not* dependent on snapshotting every turn. Every battle already records
  an `inputLog` (`sim/battle.ts`) - every player choice plus the RNG seed -
  which is how bug reports get reproduced deterministically today. Replaying
  that log up to turn 7 and resuming from there is realistic in principle.
  The hard part isn't storage, it's *resuming a live interactive session*
  from a replayed point without leaking either side's hidden team info to
  the wrong player, plus deciding what's fair when a rollback undoes a turn
  outcome a player already saw.
- **How often this would actually be needed is the open question that
  should decide whether to build it at all.** Most server crashes here are
  *non-fatal* - `Config.crashguard` (`server/index.ts`) catches uncaught
  exceptions/rejections and keeps the process (and any in-progress battle)
  alive, so systemd never even restarts. This would only matter for a
  genuinely *fatal* process death (OOM-kill, a manual `systemctl restart`,
  a Pi reboot) - there's currently no on-disk persistence of in-progress
  battle state at all, so a fatal crash does lose the battle for good today.
  Worth building only if that specific failure mode (not disconnects, not
  non-fatal crashes) turns out to happen often enough in practice to justify
  the complexity above.

## Teambuilder custom stat-rating fields

**Idea:** show the league's own computed "offensive rating" and "defensive
rating" next to the normal stat rows in the teambuilder for each Pokémon.

**Status:** exploratory only, flagged by the original suggestion as possibly
too much visual clutter - an open design question, not a committed feature.
Would need:

- A definition of what the rating formula actually is (not discussed yet)
- A client-side change in `battle-team-editor.tsx`, following the same
  narrow-flag pattern already used there for other custom display logic
  (`usesStatPoints`, `disablesTera`, the draft-points display, etc.)
