# Cart Return

Top-down arcade game: you work the parking lot. Collect loose carts from the
corrals scattered around the lot, push them back to the store's cart return, and
don't get flattened by traffic or bowled over by shoppers.

## Run it

Double-click `index.html`, or serve it:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

Phaser 3.80.1 is vendored in `vendor/phaser.min.js`; if that file goes missing the
page falls back to the cdnjs copy.

## Players

The title screen picks the mode: **1** for solo, **2** for two players on one
keyboard. Each attendant wears a coloured ring so you can pick yourself out of
the crowd of shoppers.

| Key    | Action                                   |
| ------ | ---------------------------------------- |
| Arrows | Walk (8-way) — solo, or P1 in two-player |
| WASD   | Same — solo, or P2 in two-player         |
| R      | Restart the lot                          |
| M      | Back to the mode select                  |

Pickup and delivery are automatic: walk into a cart to take it, walk into the
CART RETURN zone to hand over everything you are pushing.

In two-player, the lot is shared but the scoring is not: each player keeps their
own score, lives and cart train, races the other to the corrals, and can pick up
carts the other one scattered. The shift ends when both players are out, and the
higher score wins it.

## Rules

- 12 carts sit in four corrals. Return them all to clear the lot; each new lot
  runs 12% faster. In two-player, carts returned by either attendant count.
- You can push up to 5 carts at once. The train rides in front of you and swings
  around as you turn, and every extra cart costs you top speed.
- Traffic kills: you lose a life, and the carts you were pushing go back to their
  corral. Three lives.
- Pedestrians don't kill you, but a collision stuns you and scatters your train
  across the asphalt, where you have to collect it again.
- 100 seconds per lot. Running out costs every player still on the clock a life.
- Score: 120 per cart, +40 for each cart beyond the first in one delivery, 600 per
  lot cleared plus 4 per second remaining.

## The lot

Storefront and sidewalk run along the top, with the cart return in front of the
doors. Below that: four horizontal driving aisles separated by bands of angled
stalls, plus one main drive lane running straight down the lot. Parked cars are
solid — you walk around them, and they double as cover from traffic.

Where the drive lane meets an aisle there is a signalled crossing (the small
red/green dots). The signals are demand-actuated: aisles hold green until a car
on the drive lane actually approaches. Cars stop for red, never drive through
each other, and a car already inside a crossing always clears it.

## Layout

```
index.html          page shell + script tags (classic scripts, so file:// works)
style.css           page chrome; CSS scales the canvas to the window
src/config.js       CFG: lot geometry, lanes, signals, player/cart/ped tuning, scoring
src/player.js       LotPlayer: one attendant's sprite, keys, cart train, lives, score
src/main.js         Phaser.Game boot (arcade physics)
src/scenes/
  BootScene.js      generates every texture procedurally (placeholder art lives here)
  MenuScene.js      title + one/two player select
  GameScene.js      lot rendering, traffic + signals, pedestrians, players, carts, scoring
  HudScene.js       per-player score / lives / train, cart counter, timer band
vendor/phaser.min.js
assets/             drop real sprites here when they exist
```

## Swapping in real sprites

`BootScene` is the only place art is created. Replace each `generateTexture(key, …)`
with a `this.load.image(key, 'assets/…')` in a `preload()` and keep the keys:

- `player_1`, `player_2`, `ped_0`…`ped_5` — people, drawn facing right (rotated
  to heading)
- `cart`
- `parked_0`…`parked_5` — parked cars, drawn pointing up
- `traffic_<body>_<paint>` — sedan / hatch / suv / van / truck in 8 paints, drawn
  pointing right; the scene flips or rotates them per lane

`BootScene.PED_KEYS`, `PARKED_KEYS` and `TRAFFIC_KEYS` are the lists the game picks
from, so adding or removing art means editing those arrays and nothing else.

## Tuning

`src/config.js` holds everything: aisle positions/speeds and `gap` (bigger gap =
sparser traffic), `stallRows` and `parkedFill`, corral positions and cart counts,
`lights` timings, `peds.count`, player speed and the per-cart speed penalty,
`levelSeconds`, `lives`, `levelSpeedStep` and the score table. Player count is
chosen at the title screen and read from the registry (`playerCount`), so adding
a third set of keys means one more entry in `GameScene.createPlayers()`.
