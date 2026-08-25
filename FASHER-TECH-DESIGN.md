# Fasher Draft League — Tech Design

An architecture overview for developers new to this project. It explains how
the two repos relate, how a change in one flows into the other, what the
major features actually do under the hood, the tech stack, and what had to
change to make stock Pokémon Showdown run as a self-hosted league server on
a Raspberry Pi instead of Smogon's real infrastructure.

For day-to-day operational commands (deploying, restarting, resetting data,
troubleshooting), see [FASHER-PI-OPERATIONS.md](./FASHER-PI-OPERATIONS.md) —
this document is about *how the system works*, that one is about *how to run
it*. For not-yet-built ideas, see [FASHER-BACKLOG.md](./FASHER-BACKLOG.md).

## The two repos

This project is a fork of the two public Pokémon Showdown repos:

- **`pokemon-showdown`** (this repo) — the game server. TypeScript on
  Node.js. Handles the WebSocket connection, chat rooms, battle simulation,
  matchmaking, and all custom Fasher league logic (draft validation, points,
  ban lists, local accounts, etc.).
- **`pokemon-showdown-client`** — the browser client. A mix of TypeScript
  (Preact-based, under `play.pokemonshowdown.com/src/`) and legacy JavaScript,
  compiled to static HTML/CSS/JS. This is what a user's browser actually
  downloads and runs.

Stock Pokémon Showdown has a *third* repo, a login server
(`pokemon-showdown-loginserver`), that normally sits between the two —
handling registered Smogon accounts, ladder history, and replay storage in
MySQL/Postgres. **This deployment has no login server at all.** That single
fact is the reason a large fraction of the custom Fasher code exists — see
["No login server" below](#no-login-server-the-root-cause-of-most-custom-code).

### How they're actually served (no separate client host)

On Smogon's real infrastructure, the client is served from its own domain
(`play.pokemonshowdown.com`, an Apache host) and only *connects* to the game
server over WebSocket. This deployment collapses that: the compiled client
is copied into `server/static/` in this repo, and the game server itself
serves it as static files on the same port (8000) it accepts WebSocket
connections on. One process, one port, one domain
(`fasherdraftleague.com`) — see the [Pi hosting](#hosting-on-the-pi) section
for why.

### The third copy: the client's build cache

There is a **third** copy of this server repo's source, at
`pokemon-showdown-client/caches/pokemon-showdown/`. This is not a mistake —
the client's `build-tools/build-indexes` script needs to *run* server-side
logic (the dex, mod data, draft point config, ban lists) to generate several
client-side data files that don't exist as source at all:

- `data/pokedex.js`, `data/teambuilder-tables.js`, `data/search-index.js`,
  `data/moves,items,abilities,typechart,learnsets.js` — stock PS's own
  generated data
- `data/fasher-draft-points.js`, `data/fasher-draft-tera-banlist.js` — the
  Fasher-specific equivalents (draft costs, tera ban list), generated from
  this repo's `config/fasher-draft-points.ts` / `fasher-draft-tera-banlist.ts`

That cache directory's git `origin` remote is literally this repo's local
path — it's meant to `git pull` from here to stay in sync. **Any change to
draft points, ban lists, or format rules that should affect the client
(teambuilder cost display, tier lists, tera-ban indicator) has to reach that
cache copy and get rebuilt there before `build-indexes` will regenerate the
client's data files with the new values.** Skipping this step is the single
easiest way to end up with the client and server disagreeing about a
Pokémon's cost or legality — it happened at least once this project
(client and server briefly computed different draft-point totals for the
same box) for exactly this reason.

```
pokemon-showdown-master/              <- this repo, the real source of truth
pokemon-showdown-client/              <- the client repo
  caches/pokemon-showdown/            <- build-time-only clone of the server repo
    config/fasher-draft-points.ts     <- must be manually kept in sync
```

## Major functions

### Connecting / logging in

A browser loads the static client, which opens a SockJS (WebSocket-like)
connection to the same host on port 8000 (`server/sockets.ts`). The server
sends a `challstr` the client can use to authenticate against a login
server — except there isn't one here. `Config.noguestsecurity` is set,
which tells `server/users.ts`'s `validateToken` to skip that verification
entirely and let anyone claim any (non-staff) username with no proof at all.

That's fine for casual play, but useless for protecting a name mid-battle in
real league play — so this deployment layers its own **local password
system** on top:

- `server/fasher-accounts.ts` — scrypt-hashed username/password pairs in
  `config/fasher-accounts.json` (gitignored, per-deployment)
- `server/chat-plugins/fasher-pwlogin.ts` — the `/pwlogin NAME,password`
  command that checks/sets those passwords

This is a convenience layer, not real account security — it stops a
teammate from typing someone else's name mid-draft, not a determined
attacker. League members are expected not to reuse a password they use
elsewhere.

**Reconnecting after a dropped connection.** When a user's last connection
drops (closed tab, lost WiFi, phone switching networks), PS doesn't destroy
their `User` object immediately — it's kept alive, holding their name and
battle state, specifically so they can reconnect (`server/users.ts`'s
`markDisconnected()`/`onDisconnect()`). The part that actually lets a new
connection re-claim that name and resume the battle is `handleRename()`'s
merge logic. Stock PS only lets an *unregistered* name's stale session be
reclaimed by a new connection from **the same IP address** — a reasonable
guardrail on Smogon's real server, where a login server handles the common
"real account" reconnect and this path is just a minor courtesy for rare
guests. On this deployment, that assumption breaks completely: since there's
no login server, *everyone* reconnects through this exact unregistered-merge
path, and requiring the same IP means any WiFi hiccup, mobile network
handoff, or ISP DHCP renewal permanently locks a player out of their own
name — and their in-progress battle — until the stale session eventually
times out. This actually happened during real league play. The IP check has
been removed for this deployment; reclaiming an unregistered name now only
requires that the old session isn't currently connected (`handleRename()` in
`server/users.ts`, look for the Fasher-specific comment there for the full
reasoning). A name that's genuinely still connected elsewhere is unaffected
— this only changes what happens once a session has actually dropped.
`/pwlogin` remains the way to protect a name against being claimed by a
*different* person the instant a session drops, since password-protected
reconnects don't depend on IP or connection state at all.

### Teambuilder / Draft Plan Mode

The teambuilder is entirely client-side rendering
(`battle-team-editor.tsx`) of a packed team string, which the server only
ever sees as an opaque blob until validation. A **box** (a coach's whole
draft pool — 10-12+ Pokémon, not a 6-Pokémon battle team) is the same data
structure as a normal team, distinguished only by a `team.isBox` flag.

Two custom mechanics exist only for boxes in Draft Plan Mode:

- **Draft points budget** — every draftable species has a point cost in
  `config/fasher-draft-points.ts` (`0` = under Suspect testing/free, `99` =
  fully banned, absent = unpriced/free). The client shows a running
  remaining-points total (`TeamEditorState.remainingDraftPoints()`) and
  blocks adding a Pokémon that would exceed it or that's already in the box
  (`TeamEditorState.canAddSpecies()`).
- **Tera Captains** — one Primary and one (optional) Secondary Tera Captain
  per box get a 1.5x point-cost tax (`floor(cost * 1.5)`, except a 1-point
  Pokémon rounds up to 2 instead of down to 1). This is carried in the
  packed-team wire format as two extra trailing fields
  (`sim/teams.ts`/`battle-teams.ts` `pack`/`unpack`) beyond what stock PS's
  format defines. The Primary has no cost cap - only the main budget limits
  it. The Secondary is capped at `FASHER_SECONDARY_CAPTAIN_MAX_COST`
  (`config/fasher-draft-points.ts`) base cost, before the tax - enforced both
  client-side (the checkbox simply isn't offered for a too-expensive
  Pokémon, `battle-team-editor.tsx`) and server-side
  (`server/fasher-draft-validate.ts`, since a hand-edited/pasted box can
  bypass a client-only gate). There is deliberately no combined points cap
  across the two captains - that used to exist (`FASHER_CAPTAIN_BUDGET`) but
  was removed by league decision.

Validating a box needed a dedicated server command,
`/draftvalidate` (`server/fasher-draft-validate.ts` +
`server/chat-plugins/fasher-draft-validate.ts`), because the stock `/vtm`
command is built for a 6-Pokémon *battle-ready* team: it hard-rejects
anything over the format's team size and nags about incomplete EVs/movesets
that don't matter yet while still drafting. `/draftvalidate` reuses the real
`TeamValidator.validateSet()` per Pokémon (so actual legality — banned
species, illegal moves, complex bans — is still fully enforced), just
skipping the whole-team size gate and the two "not finished yet" nags, and
adds the points-budget check on top.

One sharp edge worth knowing: `validateSet()` has real side effects on the
set object it's given — for example, a Pokémon with the Battle Bond ability
gets its species silently rewritten to an internal "-Bond" pseudo-forme as
part of stock PS's own Ash-Greninja handling. Draft-point cost must be read
from each set *before* calling `validateSet()`, not after, or a mutated
species can end up unpriced.

**Draft league config files** — everything that defines what's draftable and
for how much lives under `config/`, all plain data (no logic):

| File | What it holds |
|---|---|
| `fasher-draft-points.ts` | Per-species point cost. `0` = Suspect (free, under review), `99` = fully banned, absent = unpriced/free |
| `fasher-draft-banlist.ts` | Species banned outright from the format (separate from a `99` cost — see below) |
| `fasher-draft-item-banlist.ts` | Banned held items |
| `fasher-draft-move-banlist.ts` | Banned moves |
| `fasher-draft-complex-banlist.ts` | Combination bans (e.g. a move only illegal on a specific species) |
| `fasher-draft-tera-banlist.ts` | Species that can't Terastallize at all (every Mega Evolution, so a Mega can't also Tera) |

A species can be excluded from play two different ways that aren't the same
thing: a `99` cost in `fasher-draft-points.ts` (shows as "banned" in the
teambuilder, still technically draftable-if-forced) versus an actual entry
in `fasher-draft-banlist.ts` (rejected by the validator outright). New
Pokémon/formes (a new Mega Evolution being added to the mod, a new regional
form, etc.) need a `fasher-draft-points.ts` entry or they'll silently show as
free/unpriced rather than erroring — this has happened for real: several
Mega Evolutions' purely-cosmetic gender/color variants (e.g.
`Meowstic-F-Mega` alongside a priced `Meowstic-M-Mega`) were missing for a
while because only the "main" forme was added by hand. When pricing a new
Mega or cosmetic variant, check whether its cosmetic sibling formes
(`species.cosmeticFormes` / matching `baseSpecies` + different `forme`) also
need the same entry.

### Battle simulation

Unchanged from stock PS — `sim/` runs the actual turn-by-turn battle engine,
driven by the active format's ruleset and mod. This league runs under the
`champions` mod (`data/mods/champions/`) with the `"Standard Draft"` ruleset
(`data/rulesets.ts`) plus per-season custom rules layered on in
`config/formats.ts` under `"[Gen 9 Champions] Fasher Draft League Season 3"`
— things like Tera Preview being disabled, the starting bank/timer values,
and the various Fasher ban lists (species, items, moves, complex bans, and a
full ban on Terastallizing while Mega Evolved).

(There's also an older, currently-unused `data/mods/fasherdraftleague/`
directory from an earlier iteration of this project, superseded by
`champions` — no active format references it. Safe to ignore unless you're
specifically archaeology-ing project history.)

### Chat, MOTD, friends, replays, custom colors

All four of these are flat-file reimplementations of stock PS features that
normally depend on the (nonexistent) login server or a database this
deployment doesn't run:

| Feature | Stock PS dependency | This deployment |
|---|---|---|
| Friends list | `better-sqlite3` + a real, week-old Smogon account | `server/fasher-friends.ts` — flat JSON, drop-in replacement for the same `Chat.Friends` interface |
| MOTD | Not a built-in PS feature at all | `server/fasher-motd.ts` + `/motd` command |
| Replays | Uploads to Smogon's login server / Postgres | `server/fasher-replays.ts` — one JSON file per replay, same shape the real replay viewer expects, so the replay viewer app works unmodified |
| Username colors | Hash-seed system tied to a Smogon account | `server/fasher-usercolors.ts` + `/customcolor` — a direct, user-picked hex color instead |

### No login server: the root cause of most custom code

If you only remember one thing about why this fork looks different from
stock PS: **there is no login server**, and almost every Fasher-specific
server file exists to route around something that normally assumes one
exists. When something in this codebase looks like it's reinventing a stock
PS feature in a much simpler way, that's almost always why.

## Known gotchas / sharp edges

Things that have actually caused real bugs on this project, collected here
so they don't get rediscovered the hard way a second time.

- **The build-cache copy (above) can refuse to sync.** `build-indexes` does
  a `git pull` inside `caches/pokemon-showdown/` before rebuilding. If that
  cache checkout has any uncommitted local changes (e.g. a config file was
  copied in by hand and not committed there), the pull fails with "local
  changes would be overwritten" and the whole build aborts. Since that
  directory is a disposable build artifact, not a real project repo,
  committing inside it (`git -C caches/pokemon-showdown commit -am "sync"`)
  is the normal fix — it isn't covered by the "don't auto-commit" policy
  that applies to the two real repos. **Watch out for a second-order version
  of this**: committing inside the cache repeatedly across sessions makes
  its `main` branch accumulate its own history, which can genuinely diverge
  from master's real commits (master gets real commits of its own between
  cache syncs) and turn the next `git pull` into an actual merge conflict
  instead of a clean fast-forward. If that happens, don't try to resolve the
  conflict - the cache's own commits aren't real work worth preserving.
  Reset it back to a clean mirror of master and re-copy whatever's currently
  staged-but-uncommitted in master on top:
  ```
  git -C caches/pokemon-showdown merge --abort   # if mid-conflict
  git -C caches/pokemon-showdown fetch origin
  git -C caches/pokemon-showdown reset --hard origin/main
  # then re-copy any config/*.ts files master has staged-but-not-committed
  ```

- **TypeScript's incremental build cache occasionally skips a changed
  file.** If a source edit doesn't seem to take effect after `node build`,
  don't trust "it should be fixed" — `touch` the changed file and rebuild
  again, then verify by grepping the actual compiled output in `dist/` (or
  the client's `js/`) for your change, not just re-reading the source.

- **Not everything that looks like a hardcoded Smogon URL is a bug.**
  `Dex.resourcePrefix` / `Config.routes.client` deliberately still points at
  `play.pokemonshowdown.com` for sprites, icons, and sounds — self-hosting
  that entire asset library isn't worth it for a small league server. But
  this deployment's *own branding* (favicon, header logo) must not use that
  prefix, or it silently shows Smogon's real logo/favicon instead of this
  league's. If you're adding new branding-type assets, use a plain local
  relative path, not `Dex.resourcePrefix`.

- **A generated `data/*.js` file changing requires `node build indexes`, not
  `node build`.** Plain `node build` only recompiles TypeScript; anything
  that flows through `build-tools/build-indexes` (draft points, ban lists,
  teambuilder tier data, the pokedex itself) is gitignored and only ever
  regenerated by that script. See
  [FASHER-PI-OPERATIONS.md](./FASHER-PI-OPERATIONS.md#deploying-changes) for
  the exact commands and a related gotcha about `build-tools/build-indexes`
  silently skipping the TS compile step if run directly instead of through
  the `node build indexes` wrapper.

- **CAP (Create-A-Pokémon) content is excluded in two separate places that
  both need to agree.** The `-CAP` rule in `config/formats.ts`'s banlist
  keeps CAP mons out of actual validation/battles; a separate client-side
  filter in `build-tools/build-indexes` hides them from teambuilder search
  entirely. Removing or changing the CAP exclusion means touching both, not
  just one.

- **Windows dev machines will show `LF will be replaced by CRLF` warnings on
  `git add`/`commit`.** Harmless — the Pi itself runs Linux, so this is a
  local line-ending normalization notice, not a real problem.

## Tech stack

**Server** (this repo):
- Node.js (>=16), TypeScript, compiled with `esbuild`
- SockJS for the client connection (`sockjs` package)
- `preact` + `preact-render-to-string` — used server-side only for rendering
  some chat/HTML fragments, not the main UI
- No database. Everything that would normally be a database row is a flat
  JSON (or TSV, for ladders) file under `config/`, gitignored and
  per-deployment

**Client** (`pokemon-showdown-client`):
- TypeScript + Preact for newer code (`play.pokemonshowdown.com/src/`),
  legacy plain JS for older parts (`oldclient/`)
- Babel-based build (`@babel/preset-typescript`, `@babel/plugin-transform-react-jsx`)
  compiling to static JS served directly — no bundler/webpack step
- Static HTML entry points (`testclient-new.html`), no client-side router
  framework beyond PS's own hand-rolled panel system

**Hosting:**
- Single Raspberry Pi, both processes (game server + tunnel) run as systemd
  services
- Cloudflare Tunnel for public access (no port forwarding, no static IP
  needed) — see below

## Hosting on the Pi

The server is not exposed directly to the internet. Instead:

- `cloudflared` (Cloudflare Tunnel) runs as its own systemd service on the
  Pi, holding an outbound-only connection to Cloudflare's edge network
- Cloudflare routes `https://fasherdraftleague.com` traffic through that
  tunnel to `http://localhost:8000` — the exact port the game server
  listens on for both the static client and the WebSocket connection
- The game server itself (`node pokemon-showdown start`) also runs as a
  systemd service, with `Restart=always` so a crash or Pi reboot recovers on
  its own

This replaced an earlier ngrok-based tunnel (free-tier ngrok domains got
blocklisted by an ISP's built-in security product, which is what prompted
buying `fasherdraftleague.com` and moving to Cloudflare — ngrok has since
been fully removed from both the Pi and both repos).

A few deployment-specific things had to be set up by hand and are **not**
part of a normal `git pull` (all gitignored, per-deployment):

- `config/config.js` — `noguestsecurity = true` (no login server, see
  above), and `routes.replays` pointed at `fasherdraftleague.com` instead of
  Smogon's real replay domain
- `config/usergroups.csv` — starts empty; the first admin has to be granted
  by hand-editing this file, since stock PS has no self-promotion mechanism
- `config/fasher-accounts.json`, `config/fasher-motd.json`,
  `config/fasher-friends.json`, `config/colors.json`, `config/replays/` —
  all the flat-file stores described above, created automatically on first
  use

Because the server serves the client's static files itself
(`server/static/`), a client-side change requires an extra manual copy step
after building that a normal PS deployment wouldn't need — see
["Deploying changes" in the ops doc](./FASHER-PI-OPERATIONS.md#deploying-changes)
for the exact commands, including a subtle gotcha around `index.html` not
existing in the client repo's own source at all.

Full setup steps (tunnel creation, DNS, systemd unit installation) are in
[FASHER-PI-OPERATIONS.md's "One-time: Cloudflare Tunnel setup"](./FASHER-PI-OPERATIONS.md#one-time-cloudflare-tunnel-setup)
— that's the canonical copy; this section is just the "why," not the "how."
