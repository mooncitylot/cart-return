# Cart Return

Top-down arcade game: you work the parking lot. Collect loose carts from the
corrals scattered around the lot, push them back to the store's cart return, and
don't get flattened by traffic or bowled over by shoppers. Power-up badges drop
around the lot as you work: a shield, a speed boost and a strength boost that
lets you haul a longer train.

## Run it

Double-click `index.html`, or serve it:

```
python3 -m http.server 8000
# then open http://localhost:8000
```

Phaser 3.80.1 is vendored in `vendor/phaser.min.js`; if that file goes missing the
page falls back to the cdnjs copy.

## Modes

The title screen picks the mode:

| Key | Mode | |
| --- | --- | --- |
| 1 | One player | Clear the lot on your own |
| 2 | Two player | Co-op on one keyboard, separate scores |
| 3 | Versus | One attendant on foot vs. one player on a moped |

Everyone wears a coloured ring so you can pick yourself out of the crowd of
shoppers. The lot is far bigger than the window, so the camera follows you and a
minimap in the corner shows the whole site: the cart return in green, loose carts
in white, power-up badges in their own colours, players as coloured dots, and a
box around what each player can see. In two-player the screen splits down the
middle, one half each, with the minimap on the seam.

The HUD counts `RETURNED n/18` — how much of the lot's quota is handed over, not
how many carts are left standing in the corrals.

| Key    | Action                                   |
| ------ | ---------------------------------------- |
| Arrows | Walk (8-way) — solo, or P1 in two-player |
| WASD   | Same — solo, or P2 in two-player         |
| R      | Restart the lot                          |
| M      | Back to the mode select                  |

Pickup and delivery are automatic: walk into a cart to take it, walk into the
CART RETURN zone to hand over everything you are pushing.

In two-player co-op, the lot is shared but the scoring is not: each player keeps
their own score, lives and cart train, races the other to the corrals, and can
pick up carts the other one scattered. The shift ends when both players are out,
and the higher score wins it.

### Versus

Player one works the lot as usual. Player two rides a moped around it with one
job: flatten the attendant. Same eight-way controls and the same top speed as an
attendant on foot — the rider's edge is that a moped never slows down for a cart
train, and it is lethal on contact. It spills and slews to a stop for a moment
whenever it hits something.

- Rider scores **+400** per takedown, and the attendant loses a life.
- Clipping a cart knocks it loose; clipping one out of the attendant's train
  costs them the delivery.
- The lot is not the rider's playground alone: hitting a shopper costs **-150**
  and hitting AI traffic costs **-100**, both with a spin-out.
- The rider cannot be knocked out — only scored against.
- **Attendant wins** by returning all 18 carts. **Rider wins** by taking the
  attendant's last life (or letting the clock run them out of lives).

## Rules

- Return 18 carts to clear a lot; each new one runs 12% faster. In two-player,
  carts returned by either attendant count. That 18 is a quota, not a headcount
  — the store keeps restocking the corrals behind you, so you never run out of
  work before the clock runs out.
- You can push up to 8 carts at once. The train trails behind you along the path
  you actually walked, and every extra cart costs you top speed. The haul back to
  the store is long, so it is nearly always worth filling the train first.
- Traffic kills: you lose a life, and the carts you were pushing go back to their
  corral. Three lives.
- Pedestrians don't kill you, but a collision stuns you and scatters your train
  across the asphalt, where you have to collect it again.
- **Shoppers tidy up after you.** A cart left loose anywhere that isn't a corral
  is fair game: a passing shopper will walk over, take it, and push it back to
  the nearest corral, which becomes that cart's new home. So a train you drop
  halfway to the store does not just sit there waiting — the lot slowly undoes
  your work. They only take carts that are already loose; carts sitting in a
  corral are left alone, and no two shoppers go for the same one.
- **The store restocks the lot.** Every 7-13 seconds a shopper wheels a cart out
  of the exit door, walks it out into the rows and racks it, then carries on as
  an ordinary shopper. They always head for the emptiest corral with room in it,
  so restocking follows you around the lot: whichever bay you just cleared is
  the one that fills back up. A corral holds 6 before they rack elsewhere, and
  the store holds off entirely once 32 carts are live on the lot. Shoppers who
  finish a trip while the lot is over its usual crowd walk back in through the
  entry door and off the board, so the place doesn't silt up with people.
- 190 seconds per lot. Running out costs every player still on the clock a life.
- Score: 120 per cart, +40 for each cart beyond the first in one delivery, 600 per
  lot cleared plus 4 per second remaining, 60 for a power-up.

### Power-ups

Badges drop into the lot every 13-22 seconds, up to three on the ground at once,
and sit for 22 seconds before fading — they blink over their last couple of
seconds, so you can tell when one isn't worth the trip. Walking over one collects
it; pickup is automatic, same as carts. Roughly two in three land out in a drive
aisle, where collecting one means stepping into live traffic, and the rest on the
walkways. They never drop within 320px of an attendant, so a badge is always a
detour. They show on the minimap in their own colour.

| Badge | | Runs for | |
| --- | --- | --- | --- |
| **Shield** | blue, shield icon | 9s | Eats one hit from anything with a motor, then breaks: you keep the life and the cart train, and get a moment of grace so the same car can't clip you twice. For its whole duration shoppers just bounce off you. In versus it refuses the rider's takedown outright — no points for them — and spills them the way hitting anything else does. |
| **Speed** | amber, lightning icon | 8s | Top speed x1.55. It scales the floor as well as the ceiling, so it is still worth having when you are dragging a full train. |
| **Strength** | purple, dumbbell icon | 13s | Push 14 carts instead of 8, and each one costs you only 30% of the usual speed penalty. It gates new pickups only: a long train gathered under it keeps following once it lapses. |

Each player's running effects show in the HUD with the seconds left on them, and
as coloured rings around their marker. Picking up a kind you already have tops
its timer up. Losing a life, or clearing the lot, wipes everything you were
carrying. Only attendants collect — in versus the rider rides straight over them.

## The lot

Modelled on a big-box warehouse store from the air. The world is 3400 x 2660px,
several screens across.

Along the north edge: the store itself, one long windowless box with roof
skylights and HVAC packs, a red entry canopy over the west end of the storefront,
a receiving yard of trailer docks behind the west wall, and a tyre-centre annex
off the east end. All of that is outside the physics world — the walkable lot is
the pavement in front of it. The storefront sidewalk runs the full paved width
and holds the cart return, in front of the doors.

Two pedestrian walkway spines run the depth of the lot, one either side of the
entrance drive, striped with a crosswalk everywhere they meet a driving aisle.
Together with the storefront sidewalk they make up the walkway network, and
shoppers stay on it for roughly four-fifths of their walking — they only step off
to reach a car out in the rows or a cart somebody left loose.

South of the sidewalk is the parking field: five horizontal driving aisles
alternating with bands of stalls, and three drive lanes running the full depth of
the lot — one down each perimeter and one straight out from the entrance. Stalls
are laid out in whole slots within two fields, one either side of the entrance
drive, so nothing straddles a lane. Every back-to-back row pair is capped at both
ends by a landscaped planter, which is solid. Stalls within a bay of the doors are
painted blue and left empty for shoppers.

Lanes are 110px wide and stalls are 72 x 104. Parked cars are solid: you walk
around them, squeeze between them, and they double as cover from traffic. Corrals
sit in three-stall bays out in the rows, so every run is a trip across live
traffic.

Where a drive lane meets an aisle there is a signalled crossing (the small
red/green dots) — fifteen of them. The signals are demand-actuated: aisles hold
green until a car on the drive lane actually approaches. Cars stop for red, never
drive through each other, and a car already inside a crossing always clears it.

## Layout

```
index.html          page shell + script tags (classic scripts, so file:// works)
style.css           page chrome; CSS scales the canvas to the window
src/config.js       CFG: lot geometry, lanes, signals, player/cart/ped/power-up tuning, scoring
src/powerup.js      Powerup: one badge on the ground — its kind, its timer, its pulse
src/player.js       LotPlayer: one attendant's sprite, keys, cart train, lives, score, effects
src/moped.js        MopedPlayer: the versus rider — a LotPlayer that rides instead of pushes
src/main.js         Phaser.Game boot (arcade physics)
src/scenes/
  BootScene.js      generates every texture procedurally (placeholder art lives here)
  MenuScene.js      title + solo / co-op / versus select
  GameScene.js      lot rendering, cameras + minimap, traffic + signals, peds, carts, scoring
  HudScene.js       per-player score / lives / train, cart counter, timer band, end card
vendor/phaser.min.js
assets/             drop real sprites here when they exist
```

## Swapping in real sprites

`BootScene` is the only place art is created. Replace each `generateTexture(key, …)`
with a `this.load.image(key, 'assets/…')` in a `preload()` and keep the keys:

- `player_1`, `player_2`, `ped_0`…`ped_5` — people, drawn facing right (rotated
  to heading)
- `moped` — the versus moped and its rider, drawn pointing right
- `cart`
- `power_shield`, `power_speed`, `power_strength` — power-up badges, drawn
  upright (they are never rotated to a heading); one per `CFG.powerups.kinds` row
- `parked_0`…`parked_5` — parked cars, drawn pointing up
- `traffic_<body>_<paint>` — sedan / hatch / suv / van / truck in 8 paints, drawn
  pointing right; the scene flips or rotates them per lane

`BootScene.PED_KEYS`, `PARKED_KEYS` and `TRAFFIC_KEYS` are the lists the game picks
from, so adding or removing art means editing those arrays and nothing else.

## Tuning

`src/config.js` holds everything: aisle positions/speeds/extents and `gap` (bigger
gap = sparser traffic), `fields` and `stallRows` and `parkedFill`, corral positions
and cart counts, `lights` timings, `peds.count`, player speed and the per-cart
speed penalty, `levelSeconds`, `levelQuota`, `lives`, `levelSpeedStep`, the
`moped` block (hit radius, stun lengths, spawn), the `restock` and `powerups`
blocks and the score table.

Two scales live in there and it matters which one you are editing:

- `view` is the camera viewport — how much of the lot fits on screen at once, and
  what the HUD and title screen lay themselves out against.
- `width`/`height` are the **world**: the whole lot. Everything else in the
  codebase works in world pixels. `pavement` and `lot` bound the paved area and
  the rectangle loose things are clamped inside; `laneWidth`, `stallW`/`stallH`
  and `fields` set the grain of the parking.

`walks` is the pedestrian network: the storefront sidewalk plus the two spines,
each spine carrying a `link` point where it joins the sidewalk. That trunk-and-
spines shape is what lets shoppers route between any two points with no real
pathfinding, so adding a walkway means adding a rect and its `link`.

The `peds` block sets the mix of what a shopper does next — `tidyChance` (go and
rack a stray cart), `errandChance` (walk out to a car), and whatever is left over
as a stroll along the walkways — plus `strayRange`, how far they will go out of
their way for a cart, and `stuckLimit`/`stuckCooldown`, how many shoves off a
parked car it takes before they abandon the trip.

`restock` sets how the store feeds the lot: `interval` and `firstDelay` for how
often a shopper comes out with a cart, `maxCarts` for how many live carts the lot
will hold before the store stops sending more, `corralCap` for how many one
corral takes before shoppers rack elsewhere, and `doorSpread` for how wide the
doorway they step out of is. `levelQuota` is the separate figure: how many
deliveries clear a lot. Turning `interval` down or `corralCap` up makes for a
busier, more forgiving lot; turning them the other way makes carts something you
have to go and find.

`powerups` sets the drop rate (`interval`, `maxActive`, `firstDelay`), how long a
badge waits (`lifetime`), where they land (`aisleChance`, `minPlayerDist`), what a
shield costs the attendant who spends one (`shieldStunMs`, `shieldGraceMs`), and
`kinds` — the three badges themselves, each with its roll `weight`, duration `ms`,
colours and its own numbers (`mul` for speed, `extraTrain`/`cartEase` for
strength). Adding a fourth kind means a row there, an icon in
`BootScene.makePowerup()`, and a branch in `LotPlayer` for what it does.

`camera` tunes the follow lerp, the zoom used for split-screen halves, and the
minimap size. The mode is chosen at the title screen and read from the registry
(`mode`: `solo` / `coop` / `versus`), so adding another player means one more
entry in `GameScene.createPlayers()`.
