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

Pickup is automatic out in the lot: walk into a loose cart to take it. Delivery
happens inside the store now — push your train through either door and hand it
over at the CART RETURN in the vestibule just inside. See
[Inside the store](#inside-the-store).

In two-player co-op, the lot is shared but the scoring is not: each player keeps
their own score, lives and cart train, races the other to the corrals, and can
pick up carts the other one scattered. The shift ends when both players are out,
and the higher score wins it.

### Phones and tablets

On a touchscreen the game puts an on-screen stick in the bottom corner — bottom
left for player one, bottom right for the second player, which matches the sides
of the split screen — plus ↺ and ☰ buttons for the R and M keys. Touch
anywhere in a stick's corner and the ring jumps to your thumb, so you never have
to look down to find it. The sticks are analogue: a half push is a half-speed
walk, which is what you want threading between parked cars. Keys and sticks work
at the same time, so a tablet with a keyboard can use either.

Play in landscape — the lot is a landscape shape, and portrait letterboxes it
down to a strip (the sticks move off the canvas into the space below it there, so
they stay thumb-sized either way). `?touch=1` forces the controls on for testing
on a desktop, `?touch=0` off.

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
  corral. Three lives. You come back — and start the shift — in the break room;
  see [Inside the store](#inside-the-store).
- Pedestrians don't kill you, but a collision stuns you and scatters your train
  across the asphalt, where you have to collect it again.
- **Angry coworkers come looking for you.** They cost no lives, but they will
  walk straight through a loaded attendant and leave the train everywhere. See
  below.
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

### Obstacles

Obstacles are the lot's moving hazards, as opposed to the scenery — parked cars
and planters — which simply sits there and stops you. There is one kind so far.

**Angry coworkers** are sore about being left on the tills while you get the
fresh air. They mooch around the rows at walking pace until they spot an
attendant hauling carts, then put their head down and come straight at you at
nearly cart-free running speed. Walk into one and you are shoved: the whole
train scatters across the asphalt and you spend most of a second picking
yourself up, which out in a live aisle is a problem of its own. No life is lost
— they are a nuisance, not traffic.

What makes them readable:

- They only hunt an attendant who is **actually pushing carts**. Empty-handed,
  you are beneath their notice, so the rule reads back as: don't get caught out
  in the open with a full train.
- They notice you within 340px and give up once you are 640px clear.
- Only a coworker mid-charge costs you anything: brushing past one who is
  sulking between targets, or standing over a spill, does nothing. Every shove
  follows a charge you were shown coming.
- A hunting one shows a red `!` over their head and a lit ring under their feet;
  a sulking one's ring is dull. On the minimap they are hollow red rings,
  brighter while they are coming for you.
- After a hit they stand and gloat for a second and a half, then leave everyone
  alone for another two and a half, so a stunned attendant is never hit twice
  before they can move.
- A **shield** turns one away without breaking — it only breaks on a motor. They
  charge anyway and bounce off you, and sit on the asphalt for a moment, so the
  badge is worth having out in the rows even when there is no car near you.
- In versus, the rider can flatten one — and pays the same 150 as for a shopper.

Two of them work the first lot and one more joins each lot after, up to six.

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
| **Shield** | blue, shield icon | 9s | Eats one hit from anything with a motor, then breaks: you keep the life and the cart train, and get a moment of grace so the same car can't clip you twice. For its whole duration shoppers and angry coworkers just bounce off you. In versus it refuses the rider's takedown outright — no points for them — and spills them the way hitting anything else does. |
| **Speed** | amber, lightning icon | 8s | Top speed x1.55. It scales the floor as well as the ceiling, so it is still worth having when you are dragging a full train. |
| **Strength** | purple, dumbbell icon | 13s | Push 14 carts instead of 8, and each one costs you only 30% of the usual speed penalty. It gates new pickups only: a long train gathered under it keeps following once it lapses. |

Each player's running effects show in the HUD with the seconds left on them, and
as coloured rings around their marker. Picking up a kind you already have tops
its timer up. Losing a life, or clearing the lot, wipes everything you were
carrying. Only attendants collect — in versus the rider rides straight over them.

## The lot

Modelled on a big-box warehouse store from the air. The world is 3400 x 2660px,
several screens across.

Along the north edge: the store itself, one long windowless box — parapet,
membrane roof welded down in rolls, rows of skylights over the sales floor,
rooftop units on their curbs, drains and a roof hatch — with a red entry canopy
over the west end of the storefront, a receiving yard of trailer docks behind the
west wall, and a tyre-centre annex off the east end. The dock and the annex are
outside the physics world — dressing you walk past, never into. The yard is a
working one: painted bays with dock levellers and bumpers, trailers with their
landing gear down, guard bollards along the apron, the compactor and baler, staged
pallets, and a fence with a gate shutting it off from the parking. The store
itself you walk into, through either door; see
[Inside the store](#inside-the-store) below. The storefront sidewalk runs the
full paved width in front of it, with guard bollards along the kerb across the
glass, pallets of bagged stock under the canopy, the propane cage and a bench
either side of the doors.

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
around them, squeeze between them, and they double as cover from traffic. They
come in five body styles in eight colours and nobody parks dead centre, so a row
reads as a row of cars rather than one silhouette repeated. Corrals sit in
three-stall bays out in the rows, so every run is a trip across live traffic.

The lot is lit the way a real one is, off a grid of twin-head poles standing on
the shared head line between each back-to-back stall pair — clear of the drive
aisles, costing the nose of a stall rather than a whole one. Each pole's base is
solid and each throws a pool of light, so where two of them meet the asphalt
mottles and the rows read as lit rather than flat. The asphalt underneath is
weathered: laid in passes with a cold joint between them, sealed in blocks,
patched where the trenches went in, cracked, worn black down the wheel paths of
every drive lane, and stained where cars sit all week. The accessible bays by the
doors alternate with hatched access aisles that nothing parks on.

Where a drive lane meets an aisle there is a signalled crossing (the small
red/green dots) — fifteen of them. The signals are demand-actuated: aisles hold
green until a car on the drive lane actually approaches. Cars stop for red, never
drive through each other, and a car already inside a crossing always clears it.

### Inside the store

Walk through either door — with or without a cart train — and you're inside.
The building is windowless from the outside for a reason: what's inside only
renders and only exists while at least one attendant is actually in there, so
you never see it from the lot. In two-player, one attendant can be inside
while the other works the lot; the split screen shows each of you the right
thing.

It is laid out the way a warehouse club is, back to front:

| Band | What's there |
| --- | --- |
| Back wall | The refrigerated and served perimeter: a **bakery** with its ovens behind the counter, a **meat** case backing onto the cutting room, and walk-in **dairy**, **frozen** and **produce** boxes with glass doors and condenser plant on their roofs. A **beverage** walk-in runs down the east wall. |
| Back cross aisle | Striped, with the numbered aisle markers hung over it. |
| Sales floor | Five double-sided runs of orange **pallet racking**, each broken in the middle by a cross aisle, guard posts on every corner, with a walkable lane either side. |
| Front floor | The open **apparel and seasonal** floor: flat tables of folded stock and shrink-wrapped pallet displays. |
| Front end | Eight **checkout lanes** across the width — belt, register, card terminal, bagging shelf, cashier — with gaps where the two doorways land, and the **CART RETURN** west of the lot of them. |
| Front strip | Tiled, with matting inside each doorway, nested carts waiting in both corners and the receipt-check podium beside the exit. |
| West wall | Staff-only back-of-house behind the trailer yard outside: the **break room**, the marked-out **receiving** floor with its roll-up dock doors and staged pallets, and the **food court**. |

Push a full train through either door and hand it over at the cart return,
same as the old outdoor drop zone worked. Shoppers walk the lanes with carts
and queue at the registers — cosmetic company, not part of the corral/restock
economy outside; they cross between lanes only on one of the three cross
aisles, so they never walk through the racking.

Above all of it, on a layer over everyone's heads, are the roof joists, the
high-bay light rows the polished slab reflects back, the aisle numbers and the
department banners.

The break room — lockers, vending machines, a table and the coffee counter —
is where you start the shift, and where you come back to after
losing a life. Walk in and it tops you back up to three lives, so long as
you're not already there and it isn't on cooldown (about 50 seconds between
uses) — so a life lost right outside the vestibule isn't the same setback as
one lost out in the far corner of the lot.

## Layout

```
index.html          page shell + script tags (classic scripts, so file:// works)
style.css           page chrome; CSS scales the canvas to the window, and styles the touch sticks
src/config.js       CFG: lot + store-interior geometry, lanes, signals, player/cart/ped/power-up tuning, scoring
src/powerup.js      Powerup: one badge on the ground — its kind, its timer, its pulse
src/obstacle.js     Obstacle + the kinds registered on it: the lot's moving hazards (angry coworkers)
src/storePed.js     StorePed: a cosmetic interior shopper — wanders the aisles, drifts through checkout
src/touch.js        TouchControls: the on-screen sticks and buttons, a DOM layer over the canvas
src/player.js       LotPlayer: one attendant's sprite, keys, cart train, lives, score, effects
src/moped.js        MopedPlayer: the versus rider — a LotPlayer that rides instead of pushes
src/main.js         Phaser.Game boot (arcade physics)
src/scenes/
  BootScene.js      generates every texture procedurally (placeholder art lives here)
  MenuScene.js      title + solo / co-op / versus select
  GameScene.js      lot + store-interior rendering, cameras + minimap, traffic + signals, peds, obstacles, carts, scoring
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
- `obs_coworker` — obstacles, drawn facing right like the shoppers (rotated to
  heading); one per `CFG.obstacles.kinds` row
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
`moped` block (hit radius, stun lengths, spawn), the `restock`, `powerups` and
`obstacles` blocks and the score table.

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

`obstacles` sets the lot's moving hazards: `minPlayerDist` keeps a spawn out of
an attendant's lap, and `kinds` holds one row per hazard — for the coworker, how
many work the first lot (`count`, `perLevel`, `max`), how fast they mooch and how
fast they charge (`speed`, `chargeSpeed`), how far off they notice you and how
far you have to get to shake them (`aggroRange`, `loseRange`), the size of the
train that makes you worth chasing (`minTrain`), and what a hit costs
(`hitRadius`, `stunMs`, `graceMs`, `gloatMs`, `cooldownMs`). Adding a second kind
means a row there, an icon in `BootScene.makeObstacle()`, and a class in
`src/obstacle.js` registered under the same key — `GameScene` never names a kind
itself, so nothing in the scene changes.

`camera` tunes the follow lerp, the zoom used for split-screen halves, and the
minimap size. The mode is chosen at the title screen and read from the registry
(`mode`: `solo` / `coop` / `versus`), so adding another player means one more
entry in `GameScene.createPlayers()`.

`interior` is the inside of the store — it shares world coordinates with
`CFG.store`, so `floor` sits inside it. `vestibule.dropZone` is the actual
delivery target now (`CFG.dropZone` out on the sidewalk is just a landmark
coordinate today — the junction ring and the powerup no-drop zone still want
it). `aisles` are the shelf colliders; `aisleLaneX`/`aisleY` are the lines
`StorePed` actually walks, so they need to land in the gaps between shelves,
not on them. `breakRoom` sets the room rect, its door gap (`doorX`/`doorW`),
and `spawn` — where every attendant starts and respawns — and
`rechargeCooldownMs` is the gap between free heals there. `GameScene.
constrainToZone()` is what actually enforces all of this each frame; there's
no Arcade world-bounds collision on players any more, because no single
rectangle covers both the lot and the store.
