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

## Turning controllers off and on

If you use the Home Assistant plugin and your controllers are plugged into smart plugs that Home Assistant can see, Light Show can switch them from the wall.

1. Connect the Home Assistant plugin (its address and access token).
2. Open any Light Show module's settings and find **Power**. Pick the outlet for each controller. Tapo and Kasa plugs are listed first; choose "Show every switch in Home Assistant" for other brands. Outlets whose name matches a controller are offered as suggestions, and nothing is linked until you accept them.
3. Tap a controller on the wall. Its details now have **Turn off**, **Turn on** and **Restart power** (off for 10 seconds, then back on). Turn off and Restart power need a second tap.

Good to know:

- The links are saved once for the plugin, so every Light Show module and wall shares them.
- A controller whose outlet is off shows a grey "Power off" instead of a red "Offline".
- One outlet can feed several controllers; the wall names the others before it cuts power.
- The show player is asked to shut down safely before its power is cut. Other controllers lose power straight away.
- The wall runs the 10 second wait itself. If it reloads in the middle, it turns the outlet back on when it comes back.
- Anyone who can tap the wall can use these buttons.

Light Show never talks to a plug itself. It asks Home Assistant, through the Home Assistant plugin's saved connection, about once every 30 seconds for the linked outlets only.

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
| Power | Which Home Assistant outlet powers each controller. Shared by every Light Show module. |

## Development

```bash
npm install
npm test             # unit tests (rules, feed, power, real show fixtures)
npm run typecheck
npm run build        # dist/bundle.js
npm run dev          # build on change and serve on :5173 for the editor's Developer tab
npm run audit:build  # audit/ harness: the real views against a fake show
```

The audit harness (`audit/`) mounts the real component with a stubbed SDK that answers from `test/fixtures/`. Serve `audit-dist/` and open `index.html?view=show&scenario=live&w=1080&h=1920` (`scenario`: `live`, `wait`, `done`, `down`). Add `&power=1` for a fake Home Assistant with made-up outlets (`&garage=off`, `&garage=lost`, `&ha=down`, `&ha=none`), or `&panel=1` for the settings panel. Covers for the harness go in `audit/public/art/` (not committed).
