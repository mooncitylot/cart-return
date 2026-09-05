// Every tunable for the lot lives here. Pixel coordinates, origin top-left.
// Vertical layout, top to bottom:
//   0-88    store building (solid)
//   88-108  sidewalk (safe, holds the delivery zone)
//   then alternating driving aisles and parking bands, ending in a perimeter lane.
const CFG = {
  width: 1040,
  height: 700,
  hudHeight: 42,

  store: { x: 0, y: 0, w: 1040, h: 88 },
  sidewalk: { y: 88, h: 20 },
  dropZone: { x: 300, y: 98, w: 216, h: 26 }, // centre x/y — push carts here

  // Driving aisles. `pos` is the centre line of the lane.
  // axis 'x' = horizontal lane (dir 1 drives right), axis 'y' = vertical lane
  // (dir 1 drives down). Lanes are 56px wide.
  laneWidth: 56,
  // Crossing signals, in seconds. Demand-actuated: the aisles hold green until
  // a car on the main drive lane actually approaches. allRed lets the box clear.
  lights: { minXGreen: 4, yGreen: 5, minYGreen: 2, allRed: 1, demandRange: 320 },
  // `gap` is the spacing between cars in a lane: big gaps keep the lot sparse
  // and readable, so crossings are a timing problem, not a wall of metal.
  aisles: [
    { axis: 'x', pos: 136, dir: 1, speed: 115, gap: 820 },
    { axis: 'x', pos: 344, dir: -1, speed: 150, gap: 900 },
    { axis: 'x', pos: 552, dir: 1, speed: 130, gap: 860 },
    { axis: 'x', pos: 678, dir: -1, speed: 170, gap: 940 },
    // main drive lane running straight down the lot
    { axis: 'y', pos: 660, dir: 1, speed: 135, gap: 700 },
  ],

  // Stall rows: y is the top edge, each row is stallH tall.
  stallRows: [{ y: 164 }, { y: 240 }, { y: 372 }, { y: 448 }, { y: 580 }],
  stallW: 60,
  stallH: 76,
  stallMargin: 40,
  parkedFill: 0.62, // fraction of stalls that hold a parked car

  // Cart corrals, dropped into stall rows. x,y = centre.
  corrals: [
    { x: 210, y: 202, carts: 3 },
    { x: 870, y: 278, carts: 3 },
    { x: 390, y: 486, carts: 3 },
    { x: 240, y: 618, carts: 3 },
  ],

  player: {
    spawn: { x: 300, y: 100 },
    speed: 195,
    speedPerCart: 15, // each cart in the train costs this much top speed
    minSpeed: 110,
    stunMs: 750,
  },

  cart: {
    maxTrain: 5,
    spacing: 24, // px between carts in the pushed train
    followLerp: 0.35, // how sharply the train swings around when you turn
  },

  peds: {
    count: 8,
    speed: 48,
    pauseChance: 0.004, // per-frame chance a pedestrian stops to browse
  },

  lives: 3,
  levelSeconds: 100,
  levelSpeedStep: 0.12, // traffic + pedestrian speed multiplier added per lot

  score: {
    perCart: 120,
    chainBonus: 40, // extra, per cart beyond the first, in a single delivery
    levelClear: 600,
    timeBonus: 4, // per second left when the lot is cleared
  },

  colors: {
    asphalt: 0x23272d,
    aisle: 0x1d2126,
    sidewalk: 0x3d444c,
    stallPaint: 0x505963,
    store: 0x323a44,
    storeTrim: 0x4c5765,
    doors: 0x2c4f3d,
    dropZone: 0x3f8f5e,
    corralRail: 0x6fa8d4,
    curb: 0x39424c,
  },
};
