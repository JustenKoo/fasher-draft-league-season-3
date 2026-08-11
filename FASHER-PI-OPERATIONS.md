# Fasher Draft League — Pi Operations Cheat Sheet

Quick reference for running/maintaining the league server on the Raspberry Pi
(`pi@lightpi2`). Repos live at `~/pokemon-showdown-master` (server) and
`~/pokemon-showdown-client` (client, only needed when rebuilding the client).

The game server and the ngrok tunnel both run as **systemd services** so they
survive SSH disconnects, crashes, and Pi reboots on their own.

## Everyday commands

**Check if everything's up:**
```
sudo systemctl status pokemon-showdown
sudo systemctl status ngrok
```
Look for `Active: active (running)` on both, with no `CRASH:` lines in the
recent log output shown at the bottom.

**Restart the server** (e.g. after a `git pull` with server-side changes):
```
sudo systemctl restart pokemon-showdown
```

**Restart the tunnel** (rarely needed, e.g. if it drops):
```
sudo systemctl restart ngrok
```

**Stop everything** (for maintenance, moving the Pi, etc.):
```
sudo systemctl stop pokemon-showdown
sudo systemctl stop ngrok
```

**Start everything back up:**
```
sudo systemctl start pokemon-showdown
sudo systemctl start ngrok
```

**Live logs** (Ctrl+C to exit):
```
journalctl -u pokemon-showdown -f
journalctl -u ngrok -f
```

**Server's own error log** (uncaught exceptions get written here regardless
of how it was started):
```
cat ~/pokemon-showdown-master/logs/errors.txt
```

## Deploying changes

**Server-side changes** (format rules, ban lists, mod/sim code, etc.):
```
cd ~/pokemon-showdown-master
git pull
sudo systemctl restart pokemon-showdown
```
The server rebuilds its own TS on startup — no separate manual build step.

**Client-side changes** (UI, tooltips, teambuilder, etc.):
```
cd ~/pokemon-showdown-client
git pull
node build
cp -r play.pokemonshowdown.com/* ~/pokemon-showdown-master/server/static/
cp ~/pokemon-showdown-master/server/static/testclient-new.html ~/pokemon-showdown-master/server/static/index.html
```
No restart needed for a client-only change — it's a static file swap, so just
hard-refresh the browser tab.

**Never skip that last `cp ... index.html` line.** `index.html` is what's
actually served at the domain root (the single-tunnel setup's entry point)
— but there's no `index.html` in the client repo's own source, so the
`cp -r` step above never touches it. It only exists as a one-time manual
copy of `testclient-new.html` made back when this was first set up, and
silently goes stale on every deploy that changes `testclient-new.html`
unless it's explicitly re-synced like this. (Hit this exact bug once
already — the compiled JS was correct and deployed, but the actually-served
HTML was still referencing an old script list, so a brand new feature's
data never loaded at all, with no error until the button was clicked.)

**If the change touches any generated `data/*.js` file** (teambuilder tier
data, `fasher-draft-points.js`, etc.) — a plain `node build` is **not**
enough, since those files are gitignored and only ever produced by
`build-indexes`, not by the normal TS compile. Use this instead:
```
cd ~/pokemon-showdown-client
git pull
node build indexes
cp -r play.pokemonshowdown.com/* ~/pokemon-showdown-master/server/static/
cp ~/pokemon-showdown-master/server/static/testclient-new.html ~/pokemon-showdown-master/server/static/index.html
```
**Important:** this must be `node build indexes` (through the wrapper
script), **not** `node build-tools/build-indexes` run directly — that
second form only regenerates data files and silently skips the actual
TypeScript compile step, so any `.tsx`/`.ts` source changes in the same
deploy would never make it into the built `.js` files. (Hit this exact
bug once already - the data file updated fine but a whole feature's UI
code silently never got compiled.) `node build indexes` does both: it's
the wrapper script's own way of saying "rebuild data, then compile" -
equivalent to running `build-tools/build-indexes` followed by a normal
`node build`, in one command. If in doubt, always use `node build
indexes` for client deploys instead of plain `node build` - it's a
strict superset.

**Editing the ban lists** (`config/fasher-draft-banlist.ts`,
`fasher-draft-item-banlist.ts`, `fasher-draft-move-banlist.ts`): edit on your
dev machine, commit, push, then `git pull` + restart on the Pi as above.

**Replay viewer changes** (only needed if `replay.pokemonshowdown.com/` in
the client repo changes - rare): it's deployed to its own directory,
separate from the main client, and doesn't need a build step of its own
(only `testclient.html` and the already-compiled `js/` folder are used):
```
cd ~/pokemon-showdown-client
git pull
mkdir -p ~/pokemon-showdown-master/server/static-replays
cp replay.pokemonshowdown.com/testclient.html ~/pokemon-showdown-master/server/static-replays/
cp replay.pokemonshowdown.com/download.html ~/pokemon-showdown-master/server/static-replays/
cp -r replay.pokemonshowdown.com/js ~/pokemon-showdown-master/server/static-replays/
```
This only needs to be done once for a fresh Pi setup, then again any time
`replay.pokemonshowdown.com/testclient.html` or its `js/` folder actually
changes - it's not part of the regular client deploy steps above.

**Replay upload/sharing** requires one manual one-time config value, same
category as `noguestsecurity` below: `config/config.js`'s `exports.routes`
has a `replays` field hardcoded to Smogon's real domain
(`replay.pokemonshowdown.com`) by default. Change it to this server's own
domain (whatever the ngrok tunnel/your domain actually is), or every
"Upload and share replay" link will point at Smogon's site instead of this
one:
```js
exports.routes = {
	root: 'pokemonshowdown.com',
	client: 'play.pokemonshowdown.com',
	dex: 'dex.pokemonshowdown.com',
	replays: 'your-actual-domain-here.com',   // <- change this one
};
```
Uploaded replay data itself (`config/replays/*.json`) needs no setup - the
directory is created automatically the first time anyone saves a replay.

## Syncing tier data from official Smogon (recurring, do periodically)

Our format's tiers (`data/formats-data.ts`, `data/mods/champions/formats-data.ts`)
are a static snapshot from whenever this repo was forked — they do **not**
update on their own. Official Champions tiers actually move fairly often:
roughly monthly scheduled shifts, plus ad-hoc suspect-test bans in between
(historically about every 2 weeks combining both). **Do this sync monthly at
minimum; every 2 weeks to also catch the ad-hoc bans.**

This only ever touches those two tier-data files — it has no overlap with
`config/formats.ts`, the ban lists, or any mod/ruleset customizations, so
it's safe to run without reviewing a diff first (though it's fine to check
`git diff` before committing if you want to see what changed).

Run this **on the dev machine** (not the Pi — same as all other code
changes, it gets pushed and pulled down after):

```
cd ~/pokemon-showdown-master   (or wherever the repo is checked out locally)
git fetch upstream
git checkout upstream/master -- data/formats-data.ts data/mods/champions/formats-data.ts
git commit -m "Sync Champions/NatDex tier data from upstream Smogon repo"
git push
```

(If `upstream` isn't set up yet on a given machine: `git remote add upstream https://github.com/smogon/pokemon-showdown.git`.)

Then deploy the server side as usual:
```
# on the Pi
cd ~/pokemon-showdown-master
git pull
sudo systemctl restart pokemon-showdown
```

And regenerate + redeploy the client's teambuilder data (tier display is
baked into `data/teambuilder-tables.js` at build time, so a plain `node
build` is **not** enough here — this needs the full data regeneration):
```
# on the dev machine
cd ~/pokemon-showdown-client
node build-tools/build-indexes
cp -r play.pokemonshowdown.com/data/. ~/pokemon-showdown-master/server/static/data/
```
Then push/pull that `server/static/` copy to the Pi the same way as any
other client deploy (see "Deploying changes" above) — or just re-run
`build-indexes` and the copy directly on the Pi if the client repo is
checked out there too.

## One-time / rarely-touched config

`config/config.js` is **gitignored and per-deployment** — it does NOT update
via `git pull`. If you ever re-clone the repo fresh on a new machine, you
must manually re-set `exports.noguestsecurity = true;` in it and restart, or
logins will fail with `Your authentication token was invalid.`

## Admin access

Stock Pokémon Showdown has no auto-admin mechanism at all (no first-user
bonus, nothing tied to `noguestsecurity`) — global rank lives in
`config/usergroups.csv`, a gitignored, per-deployment file, empty until you
create it. `/promote`-family commands need an existing admin to run them, so
there's no way to self-promote once the server's running with an empty file.

**Grant Administrator:**
```
echo "USERNAME,~" > ~/pokemon-showdown-master/config/usergroups.csv
sudo systemctl restart pokemon-showdown
```
No space after the comma. If `usergroups.csv` already has other rows (other
admins/mods promoted since), append a line instead of overwriting the file.
Once you have one admin, promote everyone else the normal way with
`/globaladmin`, `/globalmod`, `/globaldriver`, etc.

Stock PS additionally expects that username to be "registered," since an
unregistered name could otherwise be reclaimed by someone else, who'd inherit
the rank. This deployment has no real registration (`noguestsecurity`) — the
equivalent protection here is the local `/pwlogin` system (see
`server/fasher-accounts.ts`). Make sure the username you're granting admin to
is password-protected via `/pwlogin` before or right after promoting it.

## Resetting data

Not something to do casually. `tools/fasher-admin.js` covers the common
cases — run from the repo root:
```
node tools/fasher-admin.js reset-ladders                # wipe every format's ladder
node tools/fasher-admin.js reset-ladder <formatid>       # wipe just one format
node tools/fasher-admin.js list-ladders                  # list every ladder + current rankings
node tools/fasher-admin.js clear-accounts                # wipe all /pwlogin passwords
node tools/fasher-admin.js clear-account <username>      # wipe one /pwlogin password
node tools/fasher-admin.js list-accounts                 # list all password-protected usernames
```
**Stop the server first** (`sudo systemctl stop pokemon-showdown`) before any
reset/clear command — both the ladder and account stores are cached in
memory once the running server loads them, so file changes made while it's
running won't be picked up until it restarts. `list-ladders`/`list-accounts`
are read-only and safe to run anytime.

Under the hood: ladder standings are plain TSV, one file per format, at
`config/ladders/{formatid}.tsv` (e.g.
`config/ladders/gen9championsfasherdraftleagueseason3.tsv`) — there's no
built-in reset command in stock PS (`/disableladder` only pauses rating
updates, it doesn't clear anything). Stored usernames/passwords (the local
`/pwlogin` system) live in a single JSON file, `config/fasher-accounts.json`
(scrypt-hashed, per `server/fasher-accounts.ts`) — clearing an entry there
makes that name freely claimable again via `/pwlogin NAME,newpassword`, same
as a name nobody's ever protected. This is separate from admin/mod rank
(`config/usergroups.csv`, see above) — clearing one doesn't touch the other.

## Troubleshooting

**"Someone is already using the name" / auth token invalid for every name:**
`noguestsecurity` isn't set in this deployment's `config/config.js`. See
above.

**Server won't start / `bind EADDRINUSE 0.0.0.0:8000` in the logs:**
Something else is already bound to port 8000 (usually an old process from
before systemd was set up, or a manual `node pokemon-showdown` run that never
got killed). Find and kill it, then restart:
```
sudo lsof -i :8000
sudo kill <pid-that-isn't-the-current-systemd-managed-one>
sudo systemctl restart pokemon-showdown
```

**Server went down and you don't know why:**
```
dmesg | grep -i -E "kill|oom"        # check if the OS killed it for memory
journalctl -k --since "2 hours ago" | grep -i oom
free -h                              # check current memory pressure
cat ~/pokemon-showdown-master/logs/errors.txt
```
With systemd's `Restart=always`, it should already have come back on its own
— these are just for finding out *why* it went down in the first place.

**ngrok warns about a deprecated flag:** the current service uses `--url=`
(not the older `--domain=`), so this shouldn't recur — but if ngrok changes
its CLI again, update `/etc/systemd/system/ngrok.service` and run
`sudo systemctl daemon-reload && sudo systemctl restart ngrok`.

## Where things are

- Public URL: `https://dizziness-sampling-batch.ngrok-free.dev` (static ngrok
  domain — this one doesn't change on restart)
- Server + patched client are both served on port 8000 (single-tunnel setup,
  `server/static/` holds the built client, copied in from
  `pokemon-showdown-client/play.pokemonshowdown.com/`)
- Systemd unit files: `/etc/systemd/system/pokemon-showdown.service`,
  `/etc/systemd/system/ngrok.service`
