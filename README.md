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

## Request and voting nights (Remote Falcon)

If viewers pick songs through [Remote Falcon](https://remotefalcon.com), the wall keeps up:

- The playlist bar stays on your show all night. While a request plays it waits, outlined in blue, at the song the show picks up with, and the song gets a "Request" tag.
- Up next shows the real order: waiting requests first, then the show's own songs.
- A line under the bar says "Requests open" and how many are waiting.
- On voting nights the wall shows who is leading the vote and the top three.

The tag and the waiting bar need no setup; the show player alone can tell a request from a show song. For the list of waiting requests, the votes and "Requests open", connect Remote Falcon:

1. In Remote Falcon open Account Settings, then Account, and press Request API Access. Copy the access token and the secret key (the key is only shown once).
2. Open any Light Show module's settings, find **Remote Falcon**, paste both and press Connect.

Good to know:

- The connection is saved once for the plugin, so every Light Show module and wall shares it.
- The token and secret key are turned into one key in the editor. Only that key is saved, on the hub, and it never reaches a wall.
- The wall asks Remote Falcon once every 5 seconds while the show is playing, and about every half hour the rest of the time. If Remote Falcon stops answering, the wall carries on with what the show player tells it.
- The song names and covers you set in Remote Falcon are used on the wall, since you picked them by hand. A song it does not have is named from its music file.

## Light on the controllers

Every request is FPP's own `/api/fppd/status` (answered by fppd, no PHP), sent through the hub, which caches each answer so several walls cost the same as one.

| What | How often |
|---|---|
| Player status | every 2 s while a song plays, 5 s otherwise, and right as a song ends or a scheduled show starts |
| Each remote | once a minute, spread out; every 30 s during the show |
| Controller list, schedule, playlist | every 5 to 30 minutes |
| Remote Falcon (when connected) | every 5 s while the show plays, and right as a song changes; every 30 minutes otherwise |
| Song tags and covers | once per song, then cached |

A controller that misses one check is asked again 10 seconds later, and called Offline after two misses. While the wall sleeps, everything slows down.

## Settings

| Setting | What it does |
|---|---|
| Show player | The FPP player's address. |
| Your show: Name | What the wall calls your show, in place of "Light Show". Shared by every Light Show module. |
| Your show: Logo | A picture shown beside the name, in place of the string of bulbs. It is made small to fit. Shared by every Light Show module. |
| Your show: Main show playlist | Follows the player's schedule unless you pick one. Pick one if your player also runs other playlists, like a pre-show or a test list: the wall then counts only that one as the show and mentions anything else as "Playing now". Shared by every Light Show module. |
| View | Show, Player, Controllers or Now Playing strip. |
| Under the name | The small line under your show's name: today's date and time, when the show runs, your own words, or nothing. |
| Theme | See-through (your screen's background shows behind the module), or one of the 12 full-screen themes: Linen, Paper, Mist, Sandstone, Vellum, Bloom, Charcoal, Midnight, Slate, Aurora, Obsidian, Horizon. The player card stays dark in every theme; the Player view only takes the theme's accent color. |
| Song names from | The music file's tags, or the sequence name (for files with wrong tags). With Remote Falcon connected this steps aside: names come from there. |
| Look up album covers | Finds covers through Apple's free music search; only the title and artist are sent. With Remote Falcon connected its covers come first and this only fills in the ones it lacks. |
| Controllers | Untick a controller to leave it out of this module. Type a name to call it something else, and use the arrows to put the ones you care about first. Names and order are shared by every Light Show module. |
| Power | Which Home Assistant outlet powers each controller. Shared by every Light Show module. |
| Remote Falcon | Connects your Remote Falcon account so the wall shows requests and votes. Shared by every Light Show module. |

## Development

```bash
npm install
npm test             # unit tests (rules, feed, power, real show fixtures)
npm run typecheck
npm run build        # dist/bundle.js
npm run dev          # build on change and serve on :5173 for the editor's Developer tab
npm run audit:build  # audit/ harness: the real views against a fake show
```

The audit harness (`audit/`) mounts the real component with a stubbed SDK that answers from `test/fixtures/`. Serve `audit-dist/` and open `index.html?view=show&scenario=live&w=1080&h=1920` (`scenario`: `live`, `wait`, `done`, `down`). Add `&power=1` for a fake Home Assistant with made-up outlets (`&garage=off`, `&garage=lost`, `&ha=down`, `&ha=none`), or `&panel=1` for the settings panel. Add `&theme=linen` (any theme id) to paint a view in a theme. For a request night add `&rf=request` (also `between`, `quiet`, `vote`, or `alone` for no Remote Falcon connection), `&rfpanel=new|on|bad` for that part of the settings, and `&at=2026-11-30T19:41:40-06:00` to set the clock. Covers for the harness go in `audit/public/art/` (not committed).
