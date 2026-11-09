# Light Show for Home Screens

A home base for a [Falcon Player (FPP)](https://github.com/FalconChristmas/fpp) light show on a [Home Screens](https://homescreens.dev) display: what's playing, where the show is in tonight's playlist, when the next show starts, and how every controller is doing.

## What it shows

- **Show**: the song playing with its cover, a bar for the whole playlist, four health tiles (online, in sync, warnings, warmest), and a card for every controller. Tap a card for its details.
- **Player**: the song big, with the next three songs. Before the show it shows the next show and the first songs of the night.
- **Controllers**: every controller in detail: chip and board temperature, lowest supply voltage, any warning FPP reports.
- **Now Playing strip**: a short strip for a normal home screen.

Each view has a portrait and a landscape arrangement, picked by the shape of the module's box.

A controller card stays quiet while all is well (a green dot). It only says something when a controller needs a look: Offline, Warning, Not playing (idle while the show plays), Restarted, Running hot (75°C, 167°F, or more), or Low power (5% under its supply).

## Setup

1. Install the plugin and add the Light Show module to a screen.
2. In the module settings, type the address of the FPP player that runs your show, like `192.168.0.200` or `fpp.local`. Every controller is found through it.
3. Pick a view.

The Home Screens hub must be able to reach your show network.

## Light on the controllers

Every request is FPP's own `/api/fppd/status` (answered by fppd, no PHP), sent through the hub, which caches each answer so several walls cost the same as one.

| What | How often |
|---|---|
| Player status | every 2 s while a song plays, 15 s otherwise |
| Each remote | once a minute, spread out; every 30 s during the show |
| Controller list, schedule, playlist | every 5 to 30 minutes |
| Song tags and covers | once per song, then cached |

A controller that misses one check is asked again 10 seconds later, and called Offline after two misses. While the wall sleeps, everything slows down.

## Settings

| Setting | What it does |
|---|---|
| Show player | The FPP player's address. |
| View | Show, Player, Controllers or Now Playing strip. |
| Song names from | The music file's tags, or the sequence name (for files with wrong tags). |
| Look up album covers | Finds covers through Apple's free music search; only the title and artist are sent. |
| Controllers to show | Leave out any controller. |

## Development

```bash
npm install
npm test             # unit tests (rules, feed, real show fixtures)
npm run typecheck
npm run build        # dist/bundle.js
npm run dev          # build on change and serve on :5173 for the editor's Developer tab
npm run audit:build  # audit/ harness: the real views against a fake show
```

The audit harness (`audit/`) mounts the real component with a stubbed SDK that answers from `test/fixtures/`. Serve `audit-dist/` and open `index.html?view=show&scenario=live&w=1080&h=1920` (`scenario`: `live`, `wait`, `done`, `down`). Covers for the harness go in `audit/public/art/` (not committed).
