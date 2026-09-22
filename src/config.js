// Every tunable for the lot lives here. Pixel coordinates, origin top-left.
//
// The lot is modelled on a big-box warehouse store seen from the air: one huge
// windowless box across the north edge, a receiving yard of trailer docks off
// its west end, a tyre-centre annex off its east end, and a deep field of
// parking in front split down the middle by the entrance drive.
//
// Two coordinate scales matter here:
//   view   — the camera viewport, i.e. how much of the lot you see at once
//   width/height — the WORLD, the whole lot, several screens across
// Everything else in the codebase works in world pixels.
//
// North-to-south layout:
//   0-1080     store box, receiving yard, annex, landscaping (out of bounds)
//   1080-1195  storefront sidewalk (safe, holds the cart return)
//   1195-2577  the parking field: alternating drive aisles and stall bands
const CFG = {
  // ---- camera ----
  view: { w: 1360, h: 800 },
  hudHeight: 42,
  camera: {
    lerp: 0.12,
    splitZoom: 0.82, // two-player halves are narrow, so pull back a little
    mapW: 300,
    mapH: 232,
  },

  // ---- world ----
  width: 3400,
  height: 2660,

  // Paved extent, and the rectangle everything loose is clamped inside.
  pavement: { x: 110, y: 1080, w: 3180, h: 1512 },
  lot: { x1: 125, y1: 1080, x2: 3275, y2: 2577 },

  store: { x: 820, y: 150, w: 2160, h: 930 },
  canopy: { x: 880, y: 1000, w: 640, h: 142 }, // red entry canopy, west end of the front
  dock: { x: 150, y: 430, w: 640, h: 650 }, // trailer yard behind the west wall
  annex: { x: 3020, y: 600, w: 290, h: 480 }, // tyre centre off the east end

  sidewalk: { y: 1080, h: 115 },
  doors: [
    { x: 1700, w: 180 }, // entry
    { x: 2010, w: 180 }, // exit
  ],
  dropZone: { x: 1855, y: 1137, w: 300, h: 62 }, // centre x/y — push carts here

  // ---- parking ----
  // Two stall fields either side of the entrance drive. Stalls are laid out in
  // whole slots across each field, so nothing straddles a lane.
  fields: [
    { x1: 235, x2: 1600 },
    { x1: 1840, x2: 3165 },
  ],

  // Pedestrian network. Shoppers stay on this for most of their walking, and
  // only step off it to reach a car or a stray cart out in the rows.
  //
  // It is a tree: the storefront sidewalk is the trunk, and the two spines
  // flanking the entrance drive hang off it. `link` is where a spine meets the
  // trunk, which is all the routing needs to get between any two of them.
  walks: [
    { x: 110, y: 1080, w: 3180, h: 115 }, // storefront sidewalk
    { x: 1600, y: 1195, w: 65, h: 1382, link: { x: 1632, y: 1158 } },
    { x: 1775, y: 1195, w: 65, h: 1382, link: { x: 1807, y: 1158 } },
  ],
  // Stall rows: y is the top edge. Rows come in back-to-back pairs, each pair
  // sitting between two drive aisles.
  stallRows: [
    { y: 1305 }, { y: 1409 },
    { y: 1623 }, { y: 1727 },
    { y: 1941 }, { y: 2045 },
    { y: 2259 }, { y: 2363 },
  ],
  stallW: 72,
  stallH: 104,
  parkedFill: 0.68, // fraction of stalls that hold a parked car

  // Driving aisles. `pos` is the centre line of the lane.
  // axis 'x' = horizontal lane (dir 1 drives right), axis 'y' = vertical lane
  // (dir 1 drives down). `from`/`to` bound a lane that does not span the world.
  laneWidth: 110,
  // Crossing signals, in seconds. Demand-actuated: the aisles hold green until
  // a car on a main drive lane actually approaches. allRed lets the box clear.
  lights: { minXGreen: 4, yGreen: 5, minYGreen: 2, allRed: 1, demandRange: 460 },
  // `gap` is the spacing between cars in a lane: big gaps keep the lot sparse
  // and readable, so crossings are a timing problem, not a wall of metal.
  aisles: [
    { axis: 'x', pos: 1250, dir: -1, speed: 120, gap: 700 }, // front fire lane
    { axis: 'x', pos: 1568, dir: 1, speed: 135, gap: 640 },
    { axis: 'x', pos: 1886, dir: -1, speed: 130, gap: 660 },
    { axis: 'x', pos: 2204, dir: 1, speed: 140, gap: 620 },
    { axis: 'x', pos: 2522, dir: -1, speed: 150, gap: 720 }, // south perimeter
    // main drives running the depth of the lot
    { axis: 'y', pos: 180, dir: -1, speed: 140, gap: 640, from: 1195, to: 2660 },
    { axis: 'y', pos: 1720, dir: 1, speed: 130, gap: 600, from: 1195, to: 2660 },
    { axis: 'y', pos: 3220, dir: 1, speed: 145, gap: 660, from: 1195, to: 2660 },
  ],

  // The store keeps working while you do: shoppers come out of the exit door
  // pushing a cart and rack it in a corral, so the corrals restock behind you
  // and the lot never runs dry before the clock does.
  restock: {
    firstDelay: 6, // seconds into the lot before the first one comes out
    interval: [7, 13], // seconds between shoppers, rolled fresh each time
    maxCarts: 32, // live carts in the lot before the store holds off
    corralCap: 6, // carts a corral holds before shoppers rack elsewhere
    doorSpread: 60, // px either side of the door centre they step out of
  },

  // Cart corrals, dropped into stall rows. x,y = centre of a three-stall bay.
  corrals: [
    { x: 595, y: 1461, carts: 3 },
    { x: 2095, y: 1357, carts: 3 },
    { x: 1315, y: 1779, carts: 3 },
    { x: 2815, y: 1675, carts: 3 },
    { x: 955, y: 2311, carts: 3 },
    { x: 2455, y: 2415, carts: 3 },
  ],

  player: {
    spawn: { x: 1855, y: 1137 },
    speed: 235, // the lot is big; a slow walk across it is just dead time
    speedPerCart: 13, // each cart in the train costs this much top speed
    minSpeed: 150,
    stunMs: 750,
  },

  // Versus mode: the rider's moped. Eight-way controls and the same top speed as
  // an attendant on foot; it just never has a cart train slowing it down.
  moped: {
    spawn: { x: 2995, y: 2311 }, // a far corner stall, clear of traffic
    hitRadius: 22, // how close the moped has to be to flatten someone
    spawnGuard: 110, // attendants can't be taken down until they leave respawn
    stunOnPed: 500,
    stunOnCrash: 900,
    stunOnHit: 350,
    spinSpeed: 7, // rad/sec the spill slews through while stunned
    crashImmuneMs: 1200, // no repeat penalty while untangling from a wreck
  },

  cart: {
    maxTrain: 8, // longer trains, because the haul back to the store is long
    spacing: 24, // px between carts in the pushed train
    followLerp: 0.35, // how sharply the train swings around when you turn
  },

  // Power-ups. Badges drop into the lot on a timer, sit for a while, and hand
  // the attendant who walks over one a timed effect. Only attendants collect
  // them; the versus rider rides straight past.
  powerups: {
    maxActive: 3, // badges on the ground at once
    firstDelay: 8, // seconds into the lot before the first one drops
    interval: [13, 22], // seconds between drops, rolled fresh each time
    lifetime: 22, // seconds a badge waits to be collected before it fades
    warnMs: 2500, // a badge blinks over its last moments; so do expiring effects
    pickupRadius: 26,
    aisleChance: 0.65, // the rest land on the walkways; aisles mean live traffic
    minPlayerDist: 320, // never drops in someone's lap — a pickup is a detour
    shieldStunMs: 250, // the stagger when a shield takes a hit for you
    shieldGraceMs: 1100, // and the grace after, so one car can't clip you twice
    // The three kinds. `weight` is the roll; `ms` is how long the effect runs.
    kinds: [
      {
        key: 'shield',
        label: 'SHIELD',
        weight: 1,
        ms: 9000,
        color: 0x6fa8d4,
        text: '#8fc4ec',
      },
      {
        key: 'speed',
        label: 'SPEED',
        weight: 1,
        ms: 8000,
        color: 0xe8b13c,
        text: '#f0c86a',
        mul: 1.55, // top speed multiplier while it runs
      },
      {
        key: 'strength',
        label: 'STRENGTH',
        weight: 1,
        ms: 13000,
        color: 0xb46fe0,
        text: '#c898ea',
        extraTrain: 6, // carts on top of the usual limit
        cartEase: 0.3, // and what is left of the per-cart speed penalty
      },
    ],
  },

  // Obstacles: the lot's living hazards, as opposed to the scenery you simply
  // walk into. Each kind is a row here plus a class registered under the same
  // key in src/obstacle.js and an icon in BootScene.makeObstacle(); the scene
  // spawns whatever is listed and never names a kind itself.
  obstacles: {
    minPlayerDist: 520, // nothing ever appears in an attendant's lap
    kinds: [
      // Angry coworkers. Sore about being left the tills while you get the
      // fresh air, they wander the rows until they spot an attendant hauling a
      // train, then walk straight through them and leave the carts everywhere.
      {
        key: 'coworker',
        label: 'COWORKER',
        color: 0xd9543f,
        text: '#f09c86',
        count: 2, // on the lot for the first one
        perLevel: 1, // and one more every lot after
        max: 6,
        speed: 64, // the sulk between targets
        chargeSpeed: 195, // and the run-up once they have picked one
        aggroRange: 340, // how far off they notice a loaded attendant
        loseRange: 640, // and how far you have to get to shake them
        minTrain: 1, // an empty-handed attendant is not worth the walk
        hitRadius: 24,
        stunMs: 850, // how long the shove leaves you standing there
        graceMs: 250, // added to the stun before anything else can touch you
        gloatMs: 1500, // they stand over the spill admiring the mess
        cooldownMs: 2600, // before anyone is worth bumping into again
        dodgeMs: 450, // sidestep when a parked car gets between them and you
        knockback: 26, // px a shield throws them back
      },
    ],
  },

  peds: {
    count: 34,
    speed: 52,
    pauseChance: 0.003, // per-frame chance a pedestrian stops to browse
    reach: 16, // how close counts as having arrived at a waypoint
    // What a shopper does next, rolled each time they finish a trip. Whatever
    // is left over is a stroll along the walkways.
    tidyChance: 0.28, // go and put a stray cart back in a corral
    errandChance: 0.22, // walk out to a car somewhere in the rows
    strayRange: 1100, // furthest a shopper will go out of their way for a cart
    cartOffset: 22, // how far in front of them the cart is pushed
    stuckLimit: 3, // failed shoves before they give up on the errand
    stuckCooldown: 20, // frames before a continuing shove counts as a new one
  },

  lives: 3,
  levelSeconds: 190,
  // Deliveries that clear a lot. A quota rather than a headcount, because the
  // store restocks the corrals faster than you can ever empty them.
  levelQuota: 18,
  levelSpeedStep: 0.12, // traffic + pedestrian speed multiplier added per lot

  score: {
    perCart: 120,
    chainBonus: 40, // extra, per cart beyond the first, in a single delivery
    levelClear: 600,
    powerup: 60, // for walking over a badge, before whatever it does for you
    timeBonus: 4, // per second left when the lot is cleared
    // versus mode, for the driver
    takedown: 400,
    pedPenalty: 150,
    crashPenalty: 100,
  },

  colors: {
    grass: 0x2b3a2e,
    asphalt: 0x23272d,
    aisle: 0x1d2126,
    sidewalk: 0x3d444c,
    stallPaint: 0x505963,
    accessible: 0x3c6ea8,
    store: 0x323a44,
    storeRoof: 0x39424e,
    storeTrim: 0x4c5765,
    hvac: 0x2a313a,
    skylight: 0x46525f,
    doors: 0x2c4f3d,
    canopy: 0x9d3a33,
    canopyPost: 0x6e2a25,
    dockPad: 0x2a2f36,
    trailer: 0xc3c8cf,
    dropZone: 0x3f8f5e,
    corralRail: 0x6fa8d4,
    curb: 0x39424c,
    island: 0x36433a,
    shrub: 0x4d7a52,
    tree: 0x3f6b46,
    signBlue: 0x2c5f9e,
    signRed: 0xa8413a,
  },
};
