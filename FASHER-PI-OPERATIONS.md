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
```
No restart needed for a client-only change — it's a static file swap, so just
hard-refresh the browser tab.

**Editing the ban lists** (`config/fasher-draft-banlist.ts`,
`fasher-draft-item-banlist.ts`, `fasher-draft-move-banlist.ts`): edit on your
dev machine, commit, push, then `git pull` + restart on the Pi as above.

## One-time / rarely-touched config

`config/config.js` is **gitignored and per-deployment** — it does NOT update
via `git pull`. If you ever re-clone the repo fresh on a new machine, you
must manually re-set `exports.noguestsecurity = true;` in it and restart, or
logins will fail with `Your authentication token was invalid.`

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
