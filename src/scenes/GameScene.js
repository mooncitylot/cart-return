// The lot. Collect carts from the corrals, push them back to the store
// entrance, don't get run over. Player, pedestrians and parked cars use arcade
// physics; traffic and cart pickups use plain rect/distance tests, which is
// cheaper and easier to tune than more collider pairs.
//
// The lot is several screens across, so the scene runs a following camera (two
// of them, side by side, in the two-player modes) plus a corner minimap. Every
// coordinate in here is a world coordinate; only the HUD works in screen space.
class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create() {
    // Players and shoppers are fenced into the paved lot: the store box, the
    // trailer yard and the landscaping are simply outside the physics world.
    this.physics.world.setBounds(
      CFG.lot.x1,
      CFG.sidewalk.y,
      CFG.lot.x2 - CFG.lot.x1,
      CFG.lot.y2 - CFG.sidewalk.y
    );

    this.mode = this.registry.get('mode') || 'solo';
    this.playerCount = this.mode === 'solo' ? 1 : 2;
    this.level = 1;
    this.speedMul = 1;
    this.timeLeft = CFG.levelSeconds;
    this.gameOver = false;
    this.frame = 0;
    this.pedTarget = CFG.peds.count; // grows a head per lot, like the traffic does
    this.registry.set('gameover', null);

    this.interiorPeds = [];

    this.buildIslands();
    this.planLighting(); // before the cars: a pole costs a stall nose
    this.drawLot();
    this.buildScenery();
    this.buildLotLighting(); // its own layers — pools under the cars, poles over
    this.buildInterior();
    this.buildDoors();
    this.buildCorrals();
    this.buildForklift();
    this.buildTraffic();
    this.buildPeds();
    this.createPlayers();
    this.buildObstacles();
    this.buildPowerups();
    this.buildRestock();
    this.setupCameras();
    this.syncRoofVisibility(); // players may start inside — hide the roof for them
    this.bindInput();
    this.publish();
  }

  // ---------- lot geometry ----------

  // Stalls are laid out in whole slots across each field, centred in whatever
  // width is left over, so nothing ever straddles a drive lane.
  fieldSlots(field) {
    const n = Math.floor((field.x2 - field.x1) / CFG.stallW);
    const start = field.x1 + (field.x2 - field.x1 - n * CFG.stallW) / 2;
    return { n, start };
  }

  // Landscaped planters cap both ends of every back-to-back row pair, the way
  // they do in a real lot: they break the rows up and they block the aisles.
  buildIslands() {
    this.islands = [];
    for (let p = 0; p + 1 < CFG.stallRows.length; p += 2) {
      const y = CFG.stallRows[p].y;
      const h = CFG.stallH * 2;
      CFG.fields.forEach((field) => {
        const { n, start } = this.fieldSlots(field);
        [start, start + (n - 1) * CFG.stallW].forEach((x) =>
          this.islands.push({ x, y, w: CFG.stallW, h })
        );
      });
    }
  }

  inIsland(cx, cy) {
    return this.islands.some(
      (i) => cx > i.x && cx < i.x + i.w && cy > i.y && cy < i.y + i.h
    );
  }

  inCorral(x, y) {
    return CFG.corrals.some(
      (c) => Math.abs(c.x - x) < CFG.stallW * 1.5 + 18 && Math.abs(c.y - y) < CFG.stallH / 2
    );
  }

  // Stalls within a bay of the doors are painted blue and left for shoppers.
  isAccessible(cx, cy) {
    return (
      cy < CFG.stallRows[1].y + CFG.stallH &&
      Math.abs(cx - CFG.dropZone.x) < 280 &&
      !this.inCorral(cx, cy)
    );
  }

  // Inside that block the bays alternate with hatched access aisles, which
  // is what an accessible bay actually looks like — and nothing parks in
  // one, so buildScenery() skips them too.
  isAccessAisle(cx, cy) {
    if (!this.isAccessible(cx, cy)) return false;
    const field = CFG.fields.find((f) => cx > f.x1 && cx < f.x2);
    if (!field) return false;
    const { start } = this.fieldSlots(field);
    return Math.round((cx - start - CFG.stallW / 2) / CFG.stallW) % 2 === 1;
  }

  laneFrom(lane) {
    return lane.from === undefined ? 0 : lane.from;
  }

  laneTo(lane) {
    return lane.to === undefined ? this.laneExtent(lane) : lane.to;
  }

  // ---------- static world ----------

  drawLot() {
    const c = CFG.colors;
    const half = CFG.laneWidth / 2;
    const g = this.add.graphics().setDepth(0);

    // landscaping everywhere, then asphalt punched over the lot itself
    this.drawLandscaping(g);
    g.fillStyle(c.curb, 1);
    const pv = CFG.pavement;
    g.fillRect(pv.x - 6, pv.y - 6, pv.w + 12, pv.h + 12);
    g.fillStyle(c.asphalt, 1);
    g.fillRect(pv.x, pv.y, pv.w, pv.h);
    this.weatherAsphalt(g);

    this.drawStalls(g);
    this.drawWalks(g);

    // driving aisles read darker than the stall bands, and are drawn over the
    // walkways: a spine crossing a lane becomes a crosswalk, not a sidewalk.
    CFG.aisles.forEach((a) => {
      const from = this.laneFrom(a);
      const to = this.laneTo(a);
      g.fillStyle(c.aisle, 1);
      if (a.axis === 'x') g.fillRect(from, a.pos - half, to - from, CFG.laneWidth);
      else g.fillRect(a.pos - half, from, CFG.laneWidth, to - from);

      // Wheel paths: every car in the lane has driven the same two lines,
      // and after a season that is the darkest asphalt on the site.
      g.fillStyle(c.tyreWear, 0.55);
      [-19, 19].forEach((o) => {
        if (a.axis === 'x') g.fillRect(from, a.pos + o - 7, to - from, 14);
        else g.fillRect(a.pos + o - 7, from, 14, to - from);
      });

      g.fillStyle(c.stallStripe, 0.28);
      if (a.axis === 'x') {
        for (let x = from; x < to; x += 38) g.fillRect(x, a.pos - 1, 20, 2);
      } else {
        for (let y = from; y < to; y += 38) g.fillRect(a.pos - 1, y, 2, 20);
      }
    });

    this.drawCrosswalks(g);
    this.drawStorefront(g);
    this.drawIslands(g);
    this.drawJunction(g);
    this.drawStore(g);
    this.drawCanopyRoof(); // overhead layer, so it has to come after the rest
  }

  // A fixed-seed generator for everything weathered into the lot. The lot
  // is meant to look like one particular lot that has been open a few
  // years, not a different one every time you press restart.
  lotRng() {
    return new Phaser.Math.RandomDataGenerator(['cart-return-lot']);
  }

  // The site outside the paving: mown grass with the stripe a mower leaves,
  // and a planted screen between the lot edge and the road.
  drawLandscaping(g) {
    const c = CFG.colors;
    const rng = this.lotRng();

    g.fillStyle(c.grass, 1);
    g.fillRect(0, 0, CFG.width, CFG.height);
    g.fillStyle(c.grassMown, 0.5);
    for (let y = 0; y < CFG.height; y += 128) g.fillRect(0, y, CFG.width, 64);

    // The road the site fronts onto, in the strip the paving leaves along
    // the bottom of the world. It is where the drive lanes run off to, so
    // it is also the answer to where all the traffic in the lot comes from.
    const pv = CFG.pavement;
    const road = { y: pv.y + pv.h + 8, h: CFG.height - (pv.y + pv.h + 8) };
    g.fillStyle(c.asphalt, 1);
    g.fillRect(0, road.y, CFG.width, road.h);
    g.fillStyle(c.tyreWear, 0.5);
    [road.y + 14, road.y + road.h - 14].forEach((y) => g.fillRect(0, y - 6, CFG.width, 12));
    g.fillStyle(c.floorStripe, 0.4);
    for (let x = 0; x < CFG.width; x += 64) g.fillRect(x, road.y + road.h / 2 - 1, 34, 3);

    // A screen of planting down the strips the site plan leaves either
    // side of the paving, which is the only ground the lot does not use.
    const shrubs = [];
    for (let y = pv.y + 40; y < road.y - 30; y += 74) {
      shrubs.push([pv.x - 52, y]);
      shrubs.push([pv.x + pv.w + 52, y]);
    }
    shrubs.forEach(([x, y]) => {
      const jx = x + rng.between(-12, 12);
      const jy = y + rng.between(-16, 16);
      const r = 14 + rng.between(0, 9);
      g.fillStyle(0x000000, 0.26);
      g.fillCircle(jx + 4, jy + 5, r);
      g.fillStyle(rng.between(0, 2) ? c.shrub : c.tree, 0.85);
      g.fillCircle(jx, jy, r);
      g.fillStyle(0x000000, 0.12);
      g.fillCircle(jx + r * 0.3, jy + r * 0.3, r * 0.55);
    });
  }

  // Asphalt is laid in passes, patched where the trenches went in, sealed
  // in blocks and cracked by every winter since. Painting all of that on is
  // what stops 3000px of parking reading as one flat rectangle.
  weatherAsphalt(g) {
    const c = CFG.colors;
    const pv = CFG.pavement;
    const rng = this.lotRng();

    // The paving passes themselves: broad bands, each laid a shade off its
    // neighbour, with a cold joint down the line between them.
    for (let y = pv.y; y < pv.y + pv.h; y += 168) {
      g.fillStyle(c.asphaltPass, rng.realInRange(0.18, 0.5));
      g.fillRect(pv.x, y, pv.w, 168);
      g.fillStyle(c.crack, 0.4);
      g.fillRect(pv.x, y, pv.w, 2);
    }

    // Sealcoat: big irregular blocks of fresher black over the top.
    for (let i = 0; i < 14; i++) {
      const w = rng.between(240, 760);
      const h = rng.between(150, 420);
      g.fillStyle(c.asphaltSeal, rng.realInRange(0.14, 0.3));
      g.fillRect(
        rng.between(pv.x, pv.x + pv.w - w),
        rng.between(pv.y, pv.y + pv.h - h),
        w,
        h
      );
    }

    // Trench and pothole patches, lighter because they were laid later.
    for (let i = 0; i < 18; i++) {
      const w = rng.between(40, 220);
      const h = rng.between(30, 90);
      const x = rng.between(pv.x, pv.x + pv.w - w);
      const y = rng.between(pv.y, pv.y + pv.h - h);
      g.fillStyle(c.asphaltPatch, rng.realInRange(0.3, 0.55));
      g.fillRect(x, y, w, h);
      g.lineStyle(2, c.crack, 0.45);
      g.strokeRect(x, y, w, h);
    }

    // Cracks: a walk of short segments, so they wander rather than ruling
    // a straight line across the lot.
    g.lineStyle(2, c.crack, 0.5);
    for (let i = 0; i < 40; i++) {
      let x = rng.between(pv.x, pv.x + pv.w);
      let y = rng.between(pv.y, pv.y + pv.h);
      const dir = rng.rotation();
      for (let seg = 0; seg < rng.between(3, 9); seg++) {
        const a = dir + rng.realInRange(-0.7, 0.7);
        const len = rng.between(18, 54);
        const nx = x + Math.cos(a) * len;
        const ny = y + Math.sin(a) * len;
        g.lineBetween(x, y, nx, ny);
        x = nx;
        y = ny;
      }
    }
  }

  // Stall paint, and the wear that goes with it: a lot restripes on a
  // cycle, so no two lines are the same age and the ones under the busiest
  // rows are nearly gone. The accessible bays get their hatched access
  // aisle, which is the thing that actually reads as an accessible bay.
  drawStalls(g) {
    const c = CFG.colors;
    const rng = this.lotRng();

    CFG.stallRows.forEach((row) => {
      CFG.fields.forEach((field) => {
        const { n, start } = this.fieldSlots(field);
        g.fillStyle(c.stallStripe, 0.5);
        g.fillRect(start, row.y + 2, n * CFG.stallW, 3);

        for (let i = 0; i < n; i++) {
          const x = start + i * CFG.stallW;
          const cx = x + CFG.stallW / 2;
          const cy = row.y + CFG.stallH / 2;
          if (this.inIsland(cx, cy)) continue;

          // The oil a car drips over a week of sitting in the same bay.
          if (rng.frac() < 0.4) {
            g.fillStyle(c.stain, rng.realInRange(0.3, 0.6));
            g.fillEllipse(cx + rng.between(-7, 7), cy + rng.between(-14, 14), 22, 30);
          }

          if (this.isAccessAisle(cx, cy)) {
            this.drawAccessHatching(g, x, row.y);
            g.fillStyle(c.accessible, 0.9);
          } else if (this.isAccessible(cx, cy)) {
            g.fillStyle(c.accessible, 0.32);
            g.fillRect(x + 4, row.y + 5, CFG.stallW - 8, CFG.stallH - 10);
            this.drawAccessSymbol(g, cx, cy);
            g.fillStyle(c.accessible, 0.9);
          } else {
            g.fillStyle(c.stallStripe, rng.realInRange(0.35, 0.8));
          }
          g.fillRect(x - 1, row.y + 4, 3, CFG.stallH - 8);
          if (i === n - 1) g.fillRect(x + CFG.stallW - 2, row.y + 4, 3, CFG.stallH - 8);
        }
      });
    });
  }

  // One hatched no-parking aisle, filling its slot: diagonals wall to wall,
  // the way it is painted out of a stencil in one pass.
  drawAccessHatching(g, x, top) {
    const w = CFG.stallW - 8;
    const h = CFG.stallH - 10;
    g.lineStyle(2, CFG.colors.stallStripe, 0.4);
    for (let o = -h; o < w; o += 16) {
      const t0 = Math.max(0, -o);
      const t1 = Math.min(h, w - o);
      if (t1 <= t0) continue;
      g.lineBetween(x + 4 + o + t0, top + 5 + t0, x + 4 + o + t1, top + 5 + t1);
    }
  }

  // The wheelchair symbol, as a lot paints it: a stencil, not a drawing.
  drawAccessSymbol(g, cx, cy) {
    const c = CFG.colors;
    g.fillStyle(c.stallStripe, 0.8);
    g.fillCircle(cx, cy - 15, 5);
    g.fillRect(cx - 4, cy - 8, 8, 16);
    g.fillStyle(c.stallStripe, 0.8);
    g.lineStyle(4, c.stallStripe, 0.8);
    g.strokeCircle(cx + 1, cy + 8, 11);
  }

  // ---------- lot lighting ----------

  // The poles. A big-box lot stands them on the shared head line between
  // each back-to-back stall pair, so they cost the nose of a stall instead
  // of a whole one and never sit in a drive aisle. Each pool of light goes
  // down under the cars; the mast and heads go over everybody, because a
  // light pole is thirty feet of steel you walk underneath.
  // Where the poles stand. Worked out before anything is placed, because
  // the parked cars have to know to leave those stall noses alone.
  planLighting() {
    this.lightPoles = [];
    const L = CFG.lighting;

    for (let p = 0; p + 1 < CFG.stallRows.length; p += 2) {
      const y = CFG.stallRows[p].y + CFG.stallH;
      CFG.fields.forEach((field) => {
        const { n, start } = this.fieldSlots(field);
        const span = n * CFG.stallW;
        const count = Math.max(1, Math.round(span / L.spacing));
        for (let k = 1; k <= count; k++) {
          const raw = start + (span * k) / (count + 1);
          const x = start + Math.round((raw - start) / CFG.stallW) * CFG.stallW;
          if (this.inIsland(x, y) || this.inCorral(x, y)) continue;
          this.lightPoles.push({ x, y });
        }
      });
    }
  }

  nearPole(cx, cy) {
    return this.lightPoles.some(
      (p) => Math.abs(p.x - cx) < CFG.stallW / 2 + 6 && Math.abs(p.y - cy) < 34
    );
  }

  buildLotLighting() {
    const L = CFG.lighting;
    const pools = this.add.graphics().setDepth(2);
    const poles = this.add.graphics().setDepth(12);
    this.lightPoles.forEach((p) => {
      this.drawLightPool(pools, p.x, p.y, L.poolR);
      this.drawLightPole(poles, p.x, p.y, L);

      const zone = this.add.zone(p.x, p.y, L.baseR * 2, L.baseR * 2);
      this.physics.add.existing(zone, true);
      this.scenery.add(zone);
    });

    // The storefront and the dock yard are lit too, from poles standing on
    // the kerb rather than out in the rows.
    [
      [CFG.canopy.x - 60, CFG.sidewalk.y + 150],
      [CFG.dropZone.x + 520, CFG.sidewalk.y + 150],
      [CFG.dock.x + 90, CFG.dock.y + 140],
      [CFG.dock.x + 90, CFG.dock.y + CFG.dock.h - 120],
    ].forEach(([x, y]) => {
      this.drawLightPool(pools, x, y, L.poolR * 0.9);
      this.drawLightPole(poles, x, y, L);
    });
  }

  // The pool itself: stacked rings of warm light, brightest under the pole
  // and falling off to nothing. A twin-head throws wider across the rows
  // than along them, so the pool is an ellipse, and where two of them meet
  // the asphalt mottles the way a real lot's does.
  drawLightPool(g, x, y, r) {
    const steps = 11;
    for (let i = steps; i > 0; i--) {
      g.fillStyle(CFG.colors.poleLight, 0.022);
      g.fillEllipse(x, y, (r * 2.3 * i) / steps, (r * 1.7 * i) / steps);
    }
    g.fillStyle(CFG.colors.poleLight, 0.07);
    g.fillEllipse(x, y, r * 0.6, r * 0.42);
  }

  // Seen from straight above, a pole is its base, the mast foreshortened
  // to the cap on top of it, and the two heads out on their arms — which
  // at night are the brightest things on the site.
  drawLightPole(g, x, y, L) {
    g.fillStyle(CFG.colors.poleBase, 1);
    g.fillCircle(x, y, L.baseR);
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(x + 2, y + 2, L.baseR - 2);
    g.fillStyle(CFG.colors.poleMast, 1);
    g.fillCircle(x, y, L.baseR - 5);

    [-1, 1].forEach((side) => {
      const hx = x + side * (L.headSpan + 8);
      g.fillStyle(CFG.colors.poleMast, 1); // the arm
      g.fillRect(Math.min(x, hx), y - 2, Math.abs(hx - x), 5);
      g.fillStyle(CFG.colors.poleLight, 0.16); // the glow off the lens
      g.fillEllipse(hx, y, 40, 30);
      g.fillStyle(CFG.colors.poleLight, 0.3);
      g.fillEllipse(hx, y, 24, 19);
      g.fillStyle(CFG.colors.poleLight, 0.95); // the lens
      g.fillRoundedRect(hx - 9, y - 6, 18, 12, 3);
      g.fillStyle(0xfffdf6, 1);
      g.fillRoundedRect(hx - 5, y - 3, 10, 6, 2);
    });
  }

  drawWalks(g) {
    CFG.walks.forEach((w) => {
      g.fillStyle(CFG.colors.curb, 1);
      g.fillRect(w.x - 5, w.y - 2, w.w + 10, w.h + 4);
      g.fillStyle(CFG.colors.sidewalk, 1);
      g.fillRect(w.x, w.y, w.w, w.h);

      // scored joints, running across the direction of travel
      g.fillStyle(0x000000, 0.13);
      if (w.w > w.h) {
        for (let x = w.x + 90; x < w.x + w.w; x += 90) g.fillRect(x, w.y, 2, w.h);
      } else {
        for (let y = w.y + 70; y < w.y + w.h; y += 70) g.fillRect(w.x, y, w.w, 2);
      }
    });
  }

  // Where a walkway spine meets a driving aisle, paint a crossing. The spines
  // run north-south across east-west aisles, so the bars lie across the
  // pedestrian's path, square to the kerbs either side of the lane.
  drawCrosswalks(g) {
    const half = CFG.laneWidth / 2;
    CFG.walks
      .filter((w) => w.h > w.w)
      .forEach((w) => {
        CFG.aisles
          .filter((a) => a.axis === 'x' && a.pos > w.y - half && a.pos < w.y + w.h + half)
          .forEach((a) => {
            g.fillStyle(0xd8dee6, 0.34);
            const top = a.pos - half - 5;
            const bottom = a.pos + half + 5;
            for (let y = top; y < bottom - 8; y += 17) {
              g.fillRect(w.x + 3, y, w.w - 11, 9);
            }
          });
      });
  }

  // The storefront run itself: the guard bollards that stop a car coming
  // through the glass, the propane cage and the pallets of bagged goods a
  // club merchandises outside, benches, and the kerb line the whole of it
  // stands behind.
  drawStorefront(g) {
    const c = CFG.colors;
    const y = CFG.sidewalk.y;
    const h = CFG.sidewalk.h;
    const rng = this.lotRng();

    // Bollards along the kerb where they are actually needed — across the
    // front of the glass — ducking round both doorways so nobody walks a
    // train into one on the way in.
    const guarded = { x1: CFG.canopy.x - 40, x2: CFG.doors[1].x + 420 };
    for (let x = guarded.x1; x < guarded.x2; x += 88) {
      if (CFG.doors.some((d) => Math.abs(x - d.x) < d.w / 2 + 40)) continue;
      g.fillStyle(0x000000, 0.3);
      g.fillCircle(x + 3, y + h - 12, 7);
      g.fillStyle(c.floorStripe, 0.55);
      g.fillCircle(x, y + h - 14, 7);
      g.fillStyle(0xffffff, 0.14);
      g.fillCircle(x - 2, y + h - 17, 3);
    }

    // Outdoor merchandising either side of the entrance: pallets of bagged
    // stock under the canopy, and the caged propane exchange past them. All
    // of it hugs the building face, so the walkway stays clear in front of
    // it — which is both how a club stages it and what keeps the shoppers
    // on the sidewalk out of it.
    for (let i = 0; i < 6; i++) {
      const x = CFG.canopy.x + 70 + i * 96;
      const py = y + 6 + rng.between(0, 6);
      g.fillStyle(0x000000, 0.3);
      g.fillRect(x + 4, py + 5, 76, 54);
      g.fillStyle(c.palletWood, 1);
      g.fillRect(x, py, 76, 54);
      g.fillStyle(rng.frac() < 0.5 ? 0x5d6670 : 0x6a5f52, 1);
      g.fillRect(x + 5, py + 5, 66, 44);
      g.fillStyle(0xffffff, 0.08);
      g.fillRect(x + 5, py + 5, 66, 5);
    }

    const cage = { x: CFG.doors[1].x + 250, y: y + 8, w: 96, h: 56 };
    g.fillStyle(0x000000, 0.3);
    g.fillRect(cage.x + 4, cage.y + 5, cage.w, cage.h);
    g.fillStyle(c.fence, 0.9);
    g.fillRect(cage.x, cage.y, cage.w, cage.h);
    g.fillStyle(0x23272d, 1);
    g.fillRect(cage.x + 5, cage.y + 5, cage.w - 10, cage.h - 10);
    g.fillStyle(0xb4bcc4, 0.85);
    for (let k = 0; k < 8; k++) {
      g.fillCircle(cage.x + 16 + (k % 4) * 22, cage.y + 22 + ((k / 4) | 0) * 22, 8);
    }
    g.fillStyle(c.signRed, 0.8);
    g.fillRect(cage.x + 6, cage.y - 10, 44, 10);

    // A bench either side of the doors, backs to the glass.
    [CFG.doors[0].x - 190, CFG.doors[1].x + 150].forEach((bx) => {
      g.fillStyle(0x000000, 0.3);
      g.fillRect(bx + 3, y + 13, 96, 18);
      g.fillStyle(0x4a5058, 1);
      g.fillRect(bx, y + 10, 96, 18);
      g.fillStyle(0x000000, 0.2);
      for (let k = bx + 6; k < bx + 92; k += 12) g.fillRect(k, y + 10, 3, 18);
    });
  }

  drawIslands(g) {
    this.islands.forEach((i, n) => {
      g.fillStyle(CFG.colors.curb, 1);
      g.fillRoundedRect(i.x - 2, i.y - 2, i.w + 4, i.h + 4, 10);
      g.fillStyle(CFG.colors.island, 1);
      g.fillRoundedRect(i.x + 4, i.y + 4, i.w - 8, i.h - 8, 8);

      // A tree at each end and low planting between them, jittered off the
      // centre line so a row of planters doesn't read as a row of signals.
      const cx = i.x + i.w / 2;
      [i.y + 32, i.y + i.h - 32].forEach((cy, k) => {
        const r = 21 + ((n + k) % 3) * 2;
        g.fillStyle(0x000000, 0.3);
        g.fillCircle(cx + 5, cy + 6, r);
        g.fillStyle(CFG.colors.tree, 1);
        g.fillCircle(cx, cy, r);
        g.fillStyle(CFG.colors.shrub, 0.55);
        g.fillCircle(cx - r * 0.35, cy - r * 0.35, r * 0.5);
      });

      g.fillStyle(CFG.colors.shrub, 0.85);
      for (let k = 0; k < 5; k++) {
        const cy = i.y + 78 + k * ((i.h - 156) / 4);
        g.fillEllipse(cx + (k % 2 ? 11 : -11), cy, 26, 17);
      }
    });
  }

  // The painted circle where the entrance drive meets the front fire lane: the
  // lot's landmark, and the thing you aim at when hauling a train back in.
  drawJunction(g) {
    const drive = CFG.aisles.find((a) => a.axis === 'y' && Math.abs(a.pos - CFG.dropZone.x) < 300);
    if (!drive) return;
    const y = CFG.aisles[0].pos;

    // Kept inside the lane: a bigger ring would paint over the stall rows.
    g.lineStyle(4, CFG.colors.stallPaint, 0.5);
    g.strokeCircle(drive.pos, y, 52);
    g.lineStyle(2, CFG.colors.stallPaint, 0.3);
    g.strokeCircle(drive.pos, y, 38);
  }

  drawStore(g) {
    this.drawDock(g);
    this.drawAnnex(g);
    this.drawCanopy(g); // exterior, over the sidewalk — always visible
    this.buildStoreRoof();
  }

  // Everything that reads as "you can't see past this" from the parking lot
  // — the box, its roof furniture, the parapet/door strip and the signage —
  // moved off the shared lot graphics and onto its own high-depth layer (15,
  // above the canopy's 14 and players' 8) so it can be hidden per camera the
  // moment that camera's player is actually inside. See syncRoofVisibility().
  // An array, not a single object: the signage is separate Text objects.
  buildStoreRoof() {
    const c = CFG.colors;
    const s = CFG.store;
    const g = this.add.graphics().setDepth(15);
    this.storeRoof = [g];

    const rng = this.lotRng();

    // The shadow the box throws across the site.
    g.fillStyle(0x000000, 0.35);
    g.fillRect(s.x + 16, s.y + 18, s.w, s.h);

    // Parapet all the way round, then the membrane roof inside it.
    g.fillStyle(c.storeRoof, 1);
    g.fillRect(s.x, s.y, s.w, s.h);
    g.fillStyle(c.storeTrim, 1);
    g.fillRect(s.x, s.y, s.w, 5);
    g.fillStyle(c.roofMembrane, 1);
    g.fillRect(s.x + 16, s.y + 16, s.w - 32, s.h - 32);

    // Membrane seams: it is welded down in rolls, so the whole roof is
    // ruled one way at the roll width.
    g.fillStyle(c.roofSeam, 1);
    for (let x = s.x + 16; x < s.x + s.w - 16; x += 76) g.fillRect(x, s.y + 16, 2, s.h - 32);

    // The shade the parapet drops back onto the membrane inside it.
    for (let i = 5; i > 0; i--) {
      const band = i * 4;
      g.fillStyle(0x000000, 0.05);
      g.fillRect(s.x + 16, s.y + 16, s.w - 32, band);
      g.fillRect(s.x + 16, s.y + 16, band, s.h - 32);
      g.fillRect(s.x + s.w - 16 - band, s.y + 16, band, s.h - 32);
      g.fillRect(s.x + 16, s.y + s.h - 16 - band, s.w - 32, band);
    }

    // Skylights. A club daylights its floor off the roof, so they run in
    // long regular rows — which from above is most of what the roof is.
    for (let y = s.y + 74; y < s.y + s.h - 110; y += 116) {
      for (let x = s.x + 66; x < s.x + s.w - 90; x += 96) {
        g.fillStyle(0x000000, 0.22);
        g.fillRect(x + 3, y + 4, 56, 30);
        g.fillStyle(c.skylight, 0.85);
        g.fillRect(x, y, 56, 30);
        g.fillStyle(0xffffff, 0.14); // the dome catching the sky
        g.fillRect(x + 3, y + 3, 50, 9);
        g.fillStyle(0x000000, 0.2);
        g.fillRect(x, y + 27, 56, 3);
      }
    }

    // Rooftop units, each on its curb with its fan grilles. Spread on a
    // loose grid with a jitter: a plant deck is laid out to a structural
    // bay, so they scatter but never land on top of one another.
    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (rng.frac() < 0.2) continue;
        const w = rng.between(58, 88);
        const h = rng.between(42, 56);
        const x = s.x + 90 + gx * ((s.w - 250) / 5) + rng.between(-24, 24);
        const y = s.y + 70 + gy * ((s.h - 240) / 4) + rng.between(-18, 18);
        g.fillStyle(0x000000, 0.3);
        g.fillRect(x + 5, y + 6, w, h);
        g.fillStyle(c.storeTrim, 1); // the curb it stands on
        g.fillRect(x - 3, y - 3, w + 6, h + 6);
        g.fillStyle(c.hvac, 1);
        g.fillRect(x, y, w, h);
        g.fillStyle(0x1c2128, 1);
        [0.28, 0.72].forEach((f) => g.fillCircle(x + w * f, y + h / 2, 12));
        g.fillStyle(0x4b5560, 0.8);
        [0.28, 0.72].forEach((f) => g.fillCircle(x + w * f, y + h / 2, 4));
      }
    }

    // Roof drains, sitting in the shallow sump each one is set into.
    for (let i = 0; i < 12; i++) {
      const x = s.x + 150 + rng.between(0, s.w - 300);
      const y = s.y + 120 + rng.between(0, s.h - 300);
      g.fillStyle(0x000000, 0.12);
      g.fillCircle(x, y, 22);
      g.fillStyle(c.roofDrain, 1);
      g.fillCircle(x, y, 9);
      g.fillStyle(0x000000, 0.45);
      g.fillCircle(x, y, 5);
    }

    // The roof hatch and its ladder cage, up over the back-of-house.
    g.fillStyle(c.storeTrim, 1);
    g.fillRect(s.x + 70, s.y + 44, 34, 30);
    g.fillStyle(0x1f242b, 1);
    g.fillRect(s.x + 74, s.y + 48, 26, 22);
    g.fillStyle(c.hvac, 1);
    g.fillRect(s.x + 108, s.y + 50, 22, 18);
    g.lineStyle(2, c.storeTrim, 0.7);
    for (let y = s.y + 52; y < s.y + 68; y += 5) g.lineBetween(s.x + 108, y, s.x + 130, y);

    // parapet along the front, then the storefront face below it. The doors
    // themselves are separate animated objects — see buildDoors().
    g.fillStyle(c.storeTrim, 1);
    g.fillRect(s.x, s.y + s.h - 26, s.w, 26);
    g.fillStyle(c.doors, 1);
    CFG.doors.forEach((d) => g.fillRect(d.x - d.w / 2 - 6, s.y + s.h - 24, d.w + 12, 22));

    const signY = s.y + s.h - 76;
    [CFG.doors[0].x + 60, CFG.doors[1].x + 500].forEach((x) => {
      g.fillStyle(c.signBlue, 1);
      g.fillRect(x - 120, signY - 22, 240, 44);
      g.fillStyle(c.signRed, 1);
      g.fillRect(x - 120, signY + 22, 240, 12);
      this.storeRoof.push(
        this.add
          .text(x, signY, 'GROCERY', {
            fontFamily: 'monospace',
            fontSize: '26px',
            color: '#e8eef5',
          })
          .setOrigin(0.5)
          .setDepth(15)
      );
    });
    this.storeRoof.push(
      this.add
        .text(s.x + s.w / 2, s.y + s.h / 2, 'WHOLESALE', {
          fontFamily: 'monospace',
          fontSize: '84px',
          color: '#59636f',
        })
        .setOrigin(0.5)
        .setDepth(15)
    );
  }

  // The entry doors: two glass panels per doorway that slide apart when
  // anyone is near the threshold and slide shut behind them — see
  // updateDoors(). Each doorway gets a matching pair on the storefront face
  // (pushed onto storeRoof, so they hide the same way the rest of the front
  // does for a camera whose player is already inside) and a second pair
  // just inside, on the vestibule floor, since that's the only side an
  // attendant standing in the store actually sees. Both pairs animate
  // together — it is the same physical door, seen from either face.
  buildDoors() {
    this.doorGates = CFG.doors.map((d) => ({ def: d, open: false, panels: [] }));
    this.buildFrontDoorPanels();
    this.buildVestibuleDoorPanels();
  }

  buildFrontDoorPanels() {
    const c = CFG.colors;
    const s = CFG.store;
    const y = s.y + s.h - 13;
    this.addDoorPanels(y, 15, this.storeRoof, c.doorGlass);
  }

  buildVestibuleDoorPanels() {
    const c = CFG.colors;
    const y = CFG.interior.floor.y2 - 9;
    this.addDoorPanels(y, 2, null, c.doorGlass);
  }

  // Lays down one sliding-glass pair per doorway at height `y`/depth
  // `depth`, wiring each panel into its door's gate record so
  // updateDoors() can tween them. `hideWith`, if given, is the array (e.g.
  // storeRoof) the panel gets pushed onto so it hides along with it.
  addDoorPanels(y, depth, hideWith, color) {
    const h = 18;
    this.doorGates.forEach((gate) => {
      const d = gate.def;
      const half = d.w / 2;
      [-1, 1].forEach((side) => {
        const base = d.x + (side * half) / 2;
        const panel = this.add.rectangle(base, y, half - 2, h, color, 0.85).setDepth(depth);
        if (hideWith) hideWith.push(panel);
        gate.panels.push({ obj: panel, base, dir: side });
      });
    });
  }

  // Slides every doorway's panels open when a player is near its threshold
  // on either side, shut again once everyone's clear.
  updateDoors() {
    if (!this.doorGates) return;
    this.doorGates.forEach((gate) => {
      const d = gate.def;
      const near = this.players.some(
        (p) =>
          p.alive &&
          Math.abs(p.x - d.x) < d.w / 2 + 60 &&
          Math.abs(p.y - CFG.sidewalk.y) < 170
      );
      if (near === gate.open) return;
      gate.open = near;
      gate.panels.forEach((panel) => {
        this.tweens.add({
          targets: panel.obj,
          x: panel.base + (near ? panel.dir * (d.w / 2) : 0),
          duration: 320,
          ease: 'Sine.easeInOut',
        });
      });
    });
  }

  // Red entry canopy over the west end of the storefront. It is a roof that
  // juts out over the sidewalk, so it is drawn in two pieces: everything at
  // ground level here, and the overhanging lip on its own layer above the
  // people — see drawCanopyRoof(). Otherwise shoppers walk over the roof.
  drawCanopy(g) {
    const c = CFG.colors;
    const k = CFG.canopy;
    g.fillStyle(0x000000, 0.28); // shadow it throws onto the pavement
    g.fillRect(k.x + 10, k.y + 12, k.w, k.h);

    // The part sitting against the storefront, north of the walkway: nobody
    // can stand there, so it stays solid and stays down here.
    const h = CFG.sidewalk.y - k.y;
    g.fillStyle(c.canopy, 1);
    g.fillRect(k.x, k.y, k.w, h);
    g.fillStyle(0xffffff, 0.06);
    for (let x = k.x; x < k.x + k.w; x += 24) g.fillRect(x, k.y, 10, h);

    // Posts stand on the sidewalk at the outer edge, so they belong at ground
    // level too — you walk around them, under the roof they hold up.
    g.fillStyle(c.canopyPost, 1);
    for (let x = k.x + 40; x < k.x + k.w - 20; x += 120) {
      g.fillRect(x, k.y + k.h - 10, 18, 18);
    }
  }

  // The overhanging lip of the canopy, on a layer above everyone in the lot:
  // walking under it should put you in its shade, not on top of it. Kept
  // translucent so an attendant in there is still easy to follow.
  drawCanopyRoof() {
    const c = CFG.colors;
    const k = CFG.canopy;
    const y = CFG.sidewalk.y;
    const h = k.y + k.h - y;

    const g = this.add.graphics().setDepth(14).setAlpha(0.55);
    g.fillStyle(c.canopy, 1);
    g.fillRect(k.x, y, k.w, h);
    g.fillStyle(0xffffff, 0.06);
    for (let x = k.x; x < k.x + k.w; x += 24) g.fillRect(x, y, 10, h);
    g.fillStyle(c.canopyPost, 1); // leading edge, so it reads as a roof edge
    g.fillRect(k.x, y + h - 5, k.w, 5);
  }

  // Receiving yard: dock doors along the west wall with trailers backed in,
  // and the rest of what a yard is actually full of — painted bays, guard
  // bollards, the compactor and baler, staged pallets, and a fence with a
  // gate onto the lot so it reads as somewhere you are not supposed to be.
  drawDock(g) {
    const c = CFG.colors;
    const d = CFG.dock;
    const rng = this.lotRng();

    g.fillStyle(c.dockPad, 1);
    g.fillRect(d.x, d.y, d.w, d.h);
    // The pad is concrete, not asphalt: it is poured in bays with a joint
    // between each, and the tractors have scrubbed it black by the doors.
    g.lineStyle(2, 0x000000, 0.22);
    for (let x = d.x + 60; x < d.x + d.w; x += 120) g.lineBetween(x, d.y, x, d.y + d.h);
    for (let y = d.y + 66; y < d.y + d.h; y += 132) g.lineBetween(d.x, y, d.x + d.w, y);
    g.fillStyle(0x000000, 0.2);
    g.fillRect(d.x + d.w - 330, d.y, 330, d.h);

    g.fillStyle(c.storeTrim, 1);
    g.fillRect(d.x + d.w - 12, d.y, 12, d.h);

    for (let y = d.y + 40; y < d.y + d.h - 110; y += 132) {
      // The bay itself: striped out on the concrete, with a dock leveller
      // at the door and a rubber bumper either side of it.
      g.fillStyle(c.stallStripe, 0.3);
      g.fillRect(d.x + d.w - 320, y - 5, 3, 96);
      g.fillRect(d.x + d.w - 320, y - 5, 300, 3);
      g.fillRect(d.x + d.w - 320, y + 88, 300, 3);
      g.fillStyle(0x1a1e24, 1);
      g.fillRect(d.x + d.w - 26, y, 20, 86);
      g.fillStyle(0x0f1216, 1);
      g.fillRect(d.x + d.w - 30, y - 4, 6, 10);
      g.fillRect(d.x + d.w - 30, y + 80, 6, 10);

      const trailer = { x: d.x + d.w - 300, y: y + 6, w: 274, h: 74 };
      g.fillStyle(0x000000, 0.3);
      g.fillRect(trailer.x + 6, trailer.y + 7, trailer.w, trailer.h);
      g.fillStyle(c.trailer, 1);
      g.fillRect(trailer.x, trailer.y, trailer.w, trailer.h);
      g.fillStyle(0x000000, 0.08); // roof bows down the length of the box
      for (let x = trailer.x + 28; x < trailer.x + trailer.w - 10; x += 26) {
        g.fillRect(x, trailer.y, 2, trailer.h);
      }
      g.fillStyle(0x8f98a3, 1); // the nose, and the landing gear under it
      g.fillRect(trailer.x, trailer.y, 18, trailer.h);
      g.fillStyle(0x5c646e, 1);
      g.fillRect(trailer.x + 26, trailer.y + 8, 5, 58);
      g.fillStyle(0x15181c, 1); // the bogie
      g.fillRect(trailer.x + 110, y, 44, 8);
      g.fillRect(trailer.x + 110, y + 78, 44, 8);
    }

    this.drawYardPlant(g, d, rng);
  }

  // The working half of the yard: compactor and baler against the wall,
  // pallets and stacked bales staged out on the pad, guard bollards round
  // the lot of it, and the fence line shutting it off from the parking.
  drawYardPlant(g, d, rng) {
    const c = CFG.colors;
    const bottom = d.y + d.h;

    // Trash compactor and cardboard baler, in the bay below the last dock.
    [
      { x: d.x + d.w - 210, y: bottom - 96, w: 190, h: 58, label: true },
      { x: d.x + d.w - 330, y: bottom - 96, w: 104, h: 58, label: false },
    ].forEach((m) => {
      g.fillStyle(0x000000, 0.32);
      g.fillRect(m.x + 6, m.y + 7, m.w, m.h);
      g.fillStyle(c.yardPlant, 1);
      g.fillRect(m.x, m.y, m.w, m.h);
      g.fillStyle(0xffffff, 0.06);
      g.fillRect(m.x, m.y, m.w, 6);
      g.fillStyle(0x1e2228, 1);
      for (let x = m.x + 12; x < m.x + m.w - 10; x += 22) g.fillRect(x, m.y + 12, 12, m.h - 24);
      if (m.label) {
        g.fillStyle(c.signRed, 0.8);
        g.fillRect(m.x + 8, m.y + m.h - 12, 42, 7);
      }
    });

    // Pallets and bales staged out on the pad, waiting to go back.
    for (let i = 0; i < 9; i++) {
      const x = d.x + 40 + rng.between(0, 200);
      const y = d.y + 70 + rng.between(0, d.h - 240);
      const w = rng.between(44, 66);
      const h = rng.between(34, 48);
      g.fillStyle(0x000000, 0.28);
      g.fillRect(x + 4, y + 5, w, h);
      g.fillStyle(c.palletWood, 1);
      g.fillRect(x, y, w, h);
      g.fillStyle(rng.frac() < 0.5 ? 0x6a5f52 : 0x5d6670, 1);
      g.fillRect(x + 4, y + 4, w - 8, h - 8);
      g.fillStyle(0xffffff, 0.07);
      g.fillRect(x + 4, y + 4, w - 8, 4);
    }

    // Guard bollards along the wall, and the fence with its gate.
    g.fillStyle(c.floorStripe, 0.85);
    for (let y = d.y + 30; y < bottom - 20; y += 58) {
      g.fillStyle(0x000000, 0.3);
      g.fillCircle(d.x + d.w - 346, y + 2, 7);
      g.fillStyle(c.floorStripe, 0.85);
      g.fillCircle(d.x + d.w - 348, y, 7);
    }

    g.fillStyle(c.fence, 0.85);
    g.fillRect(d.x - 10, d.y - 8, 10, d.h + 8);
    g.fillRect(d.x - 10, d.y - 8, d.w + 10, 9);
    g.lineStyle(1, c.fence, 0.5);
    for (let x = d.x; x < d.x + d.w; x += 14) g.lineBetween(x, d.y - 8, x, d.y + 1);
    for (let y = d.y; y < d.y + d.h; y += 14) g.lineBetween(d.x - 10, y, d.x, y);
    g.fillStyle(c.signRed, 0.7); // the sign hung on the gate
    g.fillRect(d.x + d.w - 200, d.y - 14, 46, 14);
  }

  // Tyre centre off the east end: the same building as the warehouse in
  // miniature — parapet, membrane, a unit on the roof — with its bay doors
  // on the front, the lanes cars queue up in painted on the apron outside,
  // and the racks of stock the bays work out of.
  drawAnnex(g) {
    const c = CFG.colors;
    const a = CFG.annex;

    g.fillStyle(0x000000, 0.35);
    g.fillRect(a.x + 12, a.y + 14, a.w, a.h);
    g.fillStyle(c.storeRoof, 1);
    g.fillRect(a.x, a.y, a.w, a.h);
    g.fillStyle(c.roofMembrane, 1);
    g.fillRect(a.x + 12, a.y + 12, a.w - 24, a.h - 24);
    g.fillStyle(c.roofSeam, 1);
    for (let x = a.x + 12; x < a.x + a.w - 12; x += 76) g.fillRect(x, a.y + 12, 2, a.h - 24);
    for (let i = 4; i > 0; i--) {
      g.fillStyle(0x000000, 0.06);
      g.fillRect(a.x + 12, a.y + 12, a.w - 24, i * 4);
      g.fillRect(a.x + 12, a.y + 12, i * 4, a.h - 24);
      g.fillRect(a.x + a.w - 12 - i * 4, a.y + 12, i * 4, a.h - 24);
    }

    g.fillStyle(c.skylight, 0.8); // a couple of skylights over the bays
    [0, 1].forEach((k) => g.fillRect(a.x + 60 + k * 96, a.y + 150, 54, 28));
    g.fillStyle(0x000000, 0.3); // and the unit on the roof
    g.fillRect(a.x + 66, a.y + 66, 70, 44);
    g.fillStyle(c.storeTrim, 1);
    g.fillRect(a.x + 57, a.y + 57, 78, 52);
    g.fillStyle(c.hvac, 1);
    g.fillRect(a.x + 60, a.y + 60, 70, 44);
    g.fillStyle(0x1c2128, 1);
    [0.3, 0.7].forEach((f) => g.fillCircle(a.x + 60 + 70 * f, a.y + 82, 11));

    // The bay doors, and the lanes painted on the apron in front of them.
    const doorY = a.y + a.h - 26;
    for (let k = 0; k < 3; k++) {
      const x = a.x + 26 + k * 84;
      g.fillStyle(0x0f1216, 1);
      g.fillRect(x - 3, doorY - 3, 68, 26);
      g.fillStyle(c.doors, 1);
      g.fillRect(x, doorY, 62, 20);
      g.fillStyle(0x4d5a52, 0.8);
      for (let y = doorY + 3; y < doorY + 18; y += 5) g.fillRect(x + 2, y, 58, 2);
      g.fillStyle(c.stallStripe, 0.3); // the lane the next car waits in
      g.fillRect(x - 4, a.y + a.h, 2, 96);
      g.fillRect(x + 64, a.y + a.h, 2, 96);
    }

    // Stock racks down the side, and a stack of part-worns beside them.
    for (let y = a.y + 150; y < a.y + a.h - 80; y += 46) {
      g.fillStyle(0x000000, 0.3);
      g.fillRect(a.x + a.w - 58, y + 4, 44, 32);
      g.fillStyle(0x2a2f36, 1);
      g.fillRect(a.x + a.w - 62, y, 44, 32);
      g.fillStyle(0x3b424a, 1);
      for (let k = 0; k < 4; k++) g.fillCircle(a.x + a.w - 54 + k * 10, y + 16, 5);
    }

    this.add
      .text(a.x + a.w / 2, a.y + a.h / 2 + 40, 'TYRES', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#7d8a98',
      })
      .setOrigin(0.5)
      .setDepth(1);
  }

  // The cart return, now in the vestibule just inside the doors — see
  // buildVestibule(). Same look the exterior one used to have.
  drawInteriorDropZone() {
    const dz = CFG.interior.vestibule.dropZone;
    this.add
      .rectangle(dz.x, dz.y, dz.w, dz.h, CFG.colors.dropZone, 0.3)
      .setStrokeStyle(2, CFG.colors.dropZone)
      .setDepth(1);
    this.add
      .text(dz.x, dz.y, 'CART RETURN', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#7fd6a6',
      })
      .setOrigin(0.5)
      .setDepth(2);
  }

  // Parked cars and the planters: the scenery everyone physically bumps into.
  // The moving hazards are a separate system — see buildObstacles().
  buildScenery() {
    this.scenery = this.physics.add.staticGroup();

    this.islands.forEach((i) => {
      const zone = this.add.zone(i.x + i.w / 2, i.y + i.h / 2, i.w - 6, i.h - 6);
      this.physics.add.existing(zone, true);
      this.scenery.add(zone);
    });

    this.parked = [];
    const shadows = this.add.graphics().setDepth(2);
    const jitter = CFG.stallJitter;

    CFG.stallRows.forEach((row, rowIndex) => {
      const cy = row.y + CFG.stallH / 2;
      CFG.fields.forEach((field) => {
        const { n, start } = this.fieldSlots(field);
        for (let i = 0; i < n; i++) {
          const sx = start + i * CFG.stallW + CFG.stallW / 2;
          if (this.inIsland(sx, cy) || this.inCorral(sx, cy)) continue;
          if (this.nearPole(sx, cy)) continue; // a pole base owns that stall nose
          if (this.isAccessAisle(sx, cy)) continue; // hatched, so nothing parks on it
          if (Phaser.Math.Distance.Between(sx, cy, CFG.moped.spawn.x, CFG.moped.spawn.y) < 90) {
            continue; // keep the versus rider's start clear
          }
          if (Math.random() > CFG.parkedFill) continue;

          // Nobody parks dead centre, and the nose-out rows sit back off
          // the line rather than pulled up to it.
          const x = sx + Phaser.Math.Between(-jitter.x, jitter.x);
          const y = cy + Phaser.Math.Between(-jitter.y, jitter.y);

          // Body is the full texture rect, so nothing can be walked over.
          // Nose-out rows are flipped, not rotated: a static body reads its
          // extent from the rotated top-left corner, so an angled sprite
          // leaves its collision box offset from the car you can see.
          const car = this.scenery
            .create(x, y, Phaser.Utils.Array.GetRandom(BootScene.PARKED_KEYS))
            .setDepth(3)
            .setFlipY(rowIndex % 2 === 1);
          car.refreshBody();

          // What actually lifts a car off the asphalt: the shade under it,
          // thrown the same way everything else on the site throws its own.
          shadows.fillStyle(0x000000, 0.34);
          shadows.fillRoundedRect(
            x - car.width / 2 + 4,
            y - car.height / 2 + 6,
            car.width,
            car.height,
            7
          );
          this.parked.push(car);
        }
      });
    });
  }

  // ---------- the store interior ----------

  // The inside of the store, laid out the way a warehouse club is: a
  // refrigerated and served perimeter along the back wall, steel pallet
  // racking down the middle broken by a cross aisle, an open apparel and
  // seasonal floor in front of that, then the front end — registers, the
  // cart return and the strip the doors open onto — with staff-only
  // back-of-house down the west wall behind the trailer yard outside.
  //
  // Built once, alongside every other build*() call in create() — nothing
  // in here moves. It lives in the same world coordinates as the store box
  // drawn over it (CFG.interior.floor sits inside CFG.store), so it needs no
  // camera or world-bounds changes; visibility is handled separately, by
  // hiding that box per camera — see syncRoofVisibility().
  buildInterior() {
    const g = this.add.graphics().setDepth(0);

    this.drawInteriorFloor(g);
    this.drawInteriorShell(g);
    this.buildDepartments(g);
    this.buildAisles(g);
    this.buildFrontFloor(g);
    this.buildBackOfHouse(g);
    this.buildVestibule(g);
    this.buildBreakRoom(g);
    this.buildInteriorOverhead();
  }

  // Registers a solid rectangle of interior fixture with the scenery group:
  // racking, walk-in boxes, counters, merchandise tables. Everyone walks
  // around these, nobody through them.
  blockZone(r) {
    const zone = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
    this.physics.add.existing(zone, true);
    this.scenery.add(zone);
  }

  interiorLabel(x, y, text, size, color, depth = 2) {
    return this.add
      .text(x, y, text, { fontFamily: 'monospace', fontSize: `${size}px`, color })
      .setOrigin(0.5)
      .setDepth(depth);
  }

  // Polished concrete, not a flat slab. Saw-cut control joints on the
  // slab's own grid, the long reflected streak each run of roof lights
  // lays down the length of the floor, yellow striping along the two cross
  // aisles, and the pallet-jack scuffing that collects on them.
  drawInteriorFloor(g) {
    const f = CFG.interior.floor;
    const c = CFG.colors;
    const w = f.x2 - f.x1;
    const h = f.y2 - f.y1;

    g.fillStyle(c.interiorFloor, 1);
    g.fillRect(f.x1, f.y1, w, h);

    g.lineStyle(2, c.interiorFloorJoint, 0.4);
    for (let x = f.x1 + 80; x < f.x2; x += 160) g.lineBetween(x, f.y1, x, f.y2);
    for (let y = f.y1 + 90; y < f.y2; y += 160) g.lineBetween(f.x1, y, f.x2, y);

    // Reflections. A buffed slab throws the light rows back as a broad soft
    // streak with a hard bright core, which is most of what stops a big
    // grey floor reading as one flat fill.
    CFG.interior.aisleLaneX.forEach((x) => {
      g.fillStyle(0xffffff, 0.045);
      g.fillRect(x - 48, f.y1 + 24, 96, h - 48);
      g.fillStyle(0xffffff, 0.06);
      g.fillRect(x - 15, f.y1 + 24, 30, h - 48);
    });

    // Yellow striping down both cross aisles, and the scuff marks the
    // pallet jacks leave turning onto them.
    [CFG.interior.crossRows[0] + 4, CFG.interior.crossRows[2] + 6].forEach((y) => {
      g.fillStyle(c.floorStripe, 0.35);
      g.fillRect(f.x1 + 340, y, w - 400, 4);
    });
    g.lineStyle(3, 0x000000, 0.08);
    for (let i = 0; i < 26; i++) {
      const x = f.x1 + 260 + ((i * 397) % (w - 360));
      const y = f.y1 + 60 + ((i * 271) % (h - 160));
      g.lineBetween(x, y, x + 24 + (i % 5) * 7, y + ((i % 3) - 1) * 9);
    }
  }

  // The shell: a painted block perimeter wall on the three closed sides —
  // the south side is the storefront, and already has its own face — with
  // the dock's roll-up doors let into the west one, lined up with the
  // trailers backed onto them outside. Nothing here needs a collision
  // zone: constrainToZone() clamps players inside the wall's inner face.
  drawInteriorShell(g) {
    const f = CFG.interior.floor;
    const c = CFG.colors;
    const t = CFG.interior.wallT;
    const w = f.x2 - f.x1;
    const h = f.y2 - f.y1;

    g.fillStyle(c.interiorWall, 1);
    g.fillRect(f.x1, f.y1, w, t);
    g.fillRect(f.x1, f.y1, t, h);
    g.fillRect(f.x2 - t, f.y1, t, h);

    // Block coursing, then a lighter cap along the inner face so the wall
    // reads as standing up off the floor rather than painted onto it.
    g.fillStyle(0x000000, 0.1);
    for (let x = f.x1; x < f.x2; x += 48) g.fillRect(x, f.y1, 2, t);
    for (let y = f.y1; y < f.y2; y += 48) {
      g.fillRect(f.x1, y, t, 2);
      g.fillRect(f.x2 - t, y, t, 2);
    }
    g.fillStyle(c.interiorWallFace, 1);
    g.fillRect(f.x1, f.y1 + t - 3, w, 3);
    g.fillRect(f.x1 + t - 3, f.y1 + t, 3, h - t);
    g.fillRect(f.x2 - t, f.y1 + t, 3, h - t);

    // The shade a wall that tall drops onto the slab beside it. Cheap, and
    // it is most of what stops the floor meeting the wall as a flat seam.
    // Each pass is anchored on the wall and a little shorter than the last,
    // so the alpha stacks up against it and falls away across the slab.
    g.fillStyle(0x000000, 0.04);
    for (let i = 6; i > 0; i--) {
      const band = i * 5;
      g.fillRect(f.x1 + t, f.y1 + t, w - t * 2, band);
      g.fillRect(f.x1 + t, f.y1 + t, band, h - t);
      g.fillRect(f.x2 - t - band, f.y1 + t, band, h - t);
    }

    // Roll-up dock doors, on the same spacing as the trailer bays outside.
    const d = CFG.dock;
    for (let y = d.y + 40; y < d.y + d.h - 200; y += 132) {
      g.fillStyle(0x2f353d, 1);
      g.fillRect(f.x1, y, t, 86);
      g.fillStyle(0x59626d, 0.9);
      for (let yy = y + 6; yy < y + 82; yy += 11) g.fillRect(f.x1 + 2, yy, t - 4, 5);
    }
  }

  // ---------- the refrigerated / served perimeter ----------

  // A warehouse club rings its sales floor with refrigeration rather than
  // putting it in the racking: walk-in boxes you open a glass door into,
  // open refrigerated cases, and a served counter. Each one is a solid
  // block with its trade face — the side shoppers stand at — on the side
  // `face` names.
  buildDepartments(g) {
    CFG.interior.departments.forEach((d) => {
      this.drawDepartment(g, d);
      this.blockZone(d);
    });
  }

  drawDepartment(g, d) {
    const c = CFG.colors;
    const horiz = d.face !== 'west';
    const cold = d.kind === 'cooler' || d.kind === 'freezer';
    const shell =
      d.kind === 'freezer' ? c.freezerBox : d.kind === 'cooler' ? c.coolerBox : c.deptCounter;

    g.fillStyle(0x000000, 0.2); // grounds the box against the slab
    g.fillRect(d.x + 7, d.y + 7, d.w, d.h);
    g.fillStyle(shell, 1);
    g.fillRect(d.x, d.y, d.w, d.h);
    g.fillStyle(0xffffff, 0.08);
    g.fillRect(d.x, d.y, d.w, 5); // the lit top edge of the parapet

    // The trade face — the side shoppers stand at — runs either across the
    // block (a back-wall department) or down it (the east-wall beverage
    // run); the rest of the block is what is going on behind it.
    const faceT = 34;
    const face = horiz
      ? { x: d.x, y: d.y + d.h - faceT, w: d.w, h: faceT }
      : { x: d.x, y: d.y, w: faceT, h: d.h };
    const back = horiz
      ? { x: d.x, y: d.y + 5, w: d.w, h: d.h - faceT - 5 }
      : { x: d.x + faceT, y: d.y + 5, w: d.w - faceT, h: d.h - 5 };

    if (cold) this.drawWalkInRoof(g, back);
    else if (d.kind === 'counter') this.drawBakeryFloor(g, back);
    else this.drawCuttingRoom(g, back);

    // The face stands proud of the block, so it throws a line of shade
    // back across whatever is behind it.
    g.fillStyle(0x000000, 0.22);
    if (horiz) g.fillRect(face.x, face.y - 5, face.w, 5);
    else g.fillRect(face.x + face.w, face.y, 5, face.h);

    if (d.kind === 'counter') this.drawServedCounter(g, d, face);
    else if (d.kind === 'case') this.drawOpenCase(g, d, face);
    else this.drawCoolerDoors(g, d, face, horiz);
  }

  // The roof of a walk-in box: insulated panel joints, and the condenser
  // plant standing on it. From above that plant is most of what a walk-in
  // actually is, and it keeps the box from reading as a painted slab.
  drawWalkInRoof(g, r) {
    g.lineStyle(2, 0x000000, 0.1);
    for (let x = r.x + 44; x < r.x + r.w - 6; x += 44) g.lineBetween(x, r.y, x, r.y + r.h);
    for (let y = r.y + 44; y < r.y + r.h - 6; y += 44) g.lineBetween(r.x, y, r.x + r.w, y);

    for (let x = r.x + 20; x < r.x + r.w - 54; x += 150) {
      for (let y = r.y + 16; y < r.y + r.h - 32; y += 130) {
        g.fillStyle(0x000000, 0.18);
        g.fillRect(x + 3, y + 3, 54, 30);
        g.fillStyle(0x6f7a86, 1);
        g.fillRect(x, y, 54, 30);
        g.fillStyle(0x3a424b, 1);
        g.fillCircle(x + 16, y + 15, 10);
        g.fillCircle(x + 38, y + 15, 10);
        g.fillStyle(0x99a3ad, 0.55);
        g.fillCircle(x + 16, y + 15, 3);
        g.fillCircle(x + 38, y + 15, 3);
      }
    }
  }

  // Behind a served counter: the production floor a bakery is actually
  // mostly made of — a bank of ovens and the rack trolleys feeding them.
  drawBakeryFloor(g, r) {
    g.fillStyle(0x6b7681, 1);
    g.fillRect(r.x, r.y, r.w, r.h);
    for (let x = r.x + 18; x < r.x + r.w - 56; x += 64) {
      g.fillStyle(0x30363d, 1);
      g.fillRect(x, r.y + 6, 46, r.h - 30);
      g.fillStyle(0xc98f3f, 0.75);
      g.fillRect(x + 5, r.y + 12, 36, 6);
      g.fillRect(x + 5, r.y + 24, 36, 6);
    }
    g.fillStyle(0xb9c2cb, 1);
    for (let x = r.x + 44; x < r.x + r.w - 30; x += 64) g.fillRect(x, r.y + r.h - 20, 26, 15);
  }

  // Behind an open case: the cutting room, stainless benches and blocks.
  drawCuttingRoom(g, r) {
    g.fillStyle(0x767f8a, 1);
    g.fillRect(r.x, r.y, r.w, r.h);
    for (let x = r.x + 20; x < r.x + r.w - 44; x += 80) {
      g.fillStyle(0xb9c2cb, 1);
      g.fillRect(x, r.y + 10, 58, 22);
      g.fillStyle(0x000000, 0.14);
      g.fillRect(x, r.y + 28, 58, 4);
      g.fillStyle(0x8a6a44, 1);
      g.fillRect(x + 14, r.y + r.h - 22, 30, 15);
    }
  }

  // A run of glass doors across the face of a walk-in box, product showing
  // through them. The freezer's glass is frosted, so it reads colder and
  // gives less away than the cooler's.
  drawCoolerDoors(g, d, face, horiz) {
    const c = CFG.colors;
    const frozen = d.kind === 'freezer';
    const glass = frozen ? c.freezerGlass : c.coolerGlass;
    const span = horiz ? face.w : face.h;
    const doorW = 54;
    const n = Math.max(1, Math.floor((span - 16) / doorW));
    const pad = (span - n * doorW) / 2;

    g.fillStyle(c.coolerFrame, 1);
    g.fillRect(face.x, face.y, face.w, face.h);

    for (let i = 0; i < n; i++) {
      const o = pad + i * doorW + 3;
      const r = horiz
        ? { x: face.x + o, y: face.y + 5, w: doorW - 6, h: face.h - 10 }
        : { x: face.x + 5, y: face.y + o, w: face.w - 10, h: doorW - 6 };

      g.fillStyle(0x2a3138, 1); // the lit box behind the glass
      g.fillRect(r.x, r.y, r.w, r.h);
      // Stock on the shelves inside, seen through the door.
      const stock = d.stock || c.boxPalette;
      g.fillStyle(stock[(i + (frozen ? 3 : 0)) % stock.length], 0.85);
      if (horiz) {
        for (let y = r.y + 3; y < r.y + r.h - 3; y += 8) g.fillRect(r.x + 2, y, r.w - 4, 5);
      } else {
        for (let x = r.x + 3; x < r.x + r.w - 3; x += 8) g.fillRect(x, r.y + 2, 5, r.h - 4);
      }
      g.fillStyle(glass, frozen ? 0.62 : 0.32); // the pane itself
      g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle(0xffffff, 0.22); // and the highlight raking down it
      if (horiz) g.fillRect(r.x + 3, r.y + 3, r.w - 6, 4);
      else g.fillRect(r.x + 3, r.y + 3, 4, r.h - 6);
      g.lineStyle(2, c.coolerFrame, 1);
      g.strokeRect(r.x, r.y, r.w, r.h);
      g.fillStyle(0xd8dee6, 1); // handle
      if (horiz) g.fillRect(r.x + r.w - 6, r.y + r.h / 2 - 7, 3, 14);
      else g.fillRect(r.x + r.w / 2 - 7, r.y + r.h - 6, 14, 3);
    }
  }

  // An open refrigerated case: a dark well of product behind a stainless
  // rim, the way meat and deli are merchandised.
  drawOpenCase(g, d, face) {
    const c = CFG.colors;
    g.fillStyle(c.deptCase, 1);
    g.fillRect(face.x, face.y, face.w, face.h);

    const tray = [0xa8524f, 0xb4645c, 0x8f4744, 0xc07a6e];
    for (let x = face.x + 6; x < face.x + face.w - 10; x += 26) {
      g.fillStyle(tray[((x / 26) | 0) % tray.length], 0.9);
      g.fillRect(x, face.y + 9, 20, face.h - 20);
      g.fillStyle(0xffffff, 0.14);
      g.fillRect(x, face.y + 9, 20, 4);
    }
    g.fillStyle(0xbcc5cf, 1); // stainless rim, top and front
    g.fillRect(face.x, face.y, face.w, 5);
    g.fillRect(face.x, face.y + face.h - 4, face.w, 4);
  }

  // A served counter: worktop, a glass display case of product, and the
  // member of staff standing behind it.
  drawServedCounter(g, d, face) {
    const c = CFG.colors;
    g.fillStyle(0x5f6a76, 1);
    g.fillRect(face.x, face.y, face.w, face.h);
    g.fillStyle(0x8e99a5, 1);
    g.fillRect(face.x, face.y + face.h - 7, face.w, 7); // worktop lip

    const goods = [0xc9a45f, 0xd8b877, 0xb08149, 0xe0cb9a];
    for (let x = face.x + 10; x < face.x + face.w - 14; x += 22) {
      g.fillStyle(goods[((x / 22) | 0) % goods.length], 1);
      g.fillRect(x, face.y + 8, 16, face.h - 22);
    }
    g.fillStyle(c.doorGlass, 0.28); // the case glass over it
    g.fillRect(face.x + 4, face.y + 5, face.w - 8, face.h - 16);

    this.add
      .image(d.x + d.w / 2, face.y - 16, 'employee')
      .setDepth(6)
      .setRotation(Math.PI / 2);
  }

  // ---------- racking ----------

  // Steel pallet racking: five double-sided runs down the sales floor with
  // a walkable lane either side, each broken in the middle by a cross aisle
  // so the floor is not one unbroken wall of shelving from the back wall to
  // the front. Solid, so a player (and a cart train) has to thread the
  // lanes rather than cut through.
  buildAisles(g) {
    const { aisleCols, aisleW, aisleBays } = CFG.interior;
    const beamStep = 76;

    aisleCols.forEach((x, ci) => {
      aisleBays.forEach((bay, bi) => {
        const a = { x, y: bay.y, w: aisleW, h: bay.h };
        // Grounds the unit: a soft shadow it casts onto the floor, offset
        // toward the bottom-right so it peeks out past the shelf over it.
        g.fillStyle(0x000000, 0.16);
        g.fillRect(a.x + 5, a.y + 5, a.w, a.h);

        this.buildShelfBay(g, a, ci * aisleBays.length + bi, beamStep);
        this.drawRackGuards(g, a);
        this.blockZone(a);
      });
    });
  }

  // Yellow guard posts at the four corners of a run, bolted to the slab to
  // keep pallet jacks off the uprights. Small, and drawn rather than
  // blocking — but they are what the end of a warehouse aisle looks like,
  // and they give the lanes a repeating punctuation the bare slab lacks.
  drawRackGuards(g, a) {
    [
      [a.x + 6, a.y - 9],
      [a.x + a.w - 6, a.y - 9],
      [a.x + 6, a.y + a.h + 9],
      [a.x + a.w - 6, a.y + a.h + 9],
    ].forEach(([x, y]) => {
      g.fillStyle(0x000000, 0.22);
      g.fillCircle(x + 2, y + 2, 6);
      g.fillStyle(CFG.colors.floorStripe, 1);
      g.fillCircle(x, y, 6);
      g.fillStyle(0xffffff, 0.3);
      g.fillCircle(x - 2, y - 2, 2);
    });
  }

  // One shelf unit's contents and racking. Broken out of buildAisles() so
  // the per-level loop (pallets, then the beam and its cast shadow) reads on
  // its own. Orange steel frame (lit uprights, a beam per level with its own
  // shadow) over individually-coloured pallets, the way a real club's
  // high-bay storage reads — flat blocks of a single colour read as paint,
  // not goods on a shelf.
  buildShelfBay(g, a, ai, beamStep) {
    const c = CFG.colors;
    const pal = c.boxPalette;
    const levels = Math.max(1, Math.floor(a.h / beamStep));
    const cols = 2;
    const colW = (a.w - 12) / cols;

    for (let lvl = 0; lvl < levels; lvl++) {
      const ly = a.y + lvl * beamStep + 7;
      const lh = beamStep - 13;
      for (let col = 0; col < cols; col++) {
        const bx = a.x + 6 + col * colW;
        const box = pal[(ai * 7 + lvl * cols + col) % pal.length];
        g.fillStyle(box, 1);
        g.fillRect(bx + 1, ly, colW - 2, lh);
        // Shrink-wrap sheen: a lighter band near the top, a stray diagonal
        // streak, so each pallet catches the light instead of sitting flat.
        g.fillStyle(0xffffff, 0.1);
        g.fillRect(bx + 1, ly, colW - 2, 5);
        g.fillStyle(0xffffff, 0.05);
        g.fillTriangle(
          bx + colW * 0.32,
          ly + lh,
          bx + colW * 0.5,
          ly + lh,
          bx + colW * 0.38,
          ly + lh * 0.55
        );
        g.fillStyle(c.palletWood, 0.85); // the pallet the load sits on
        g.fillRect(bx + 1, ly + lh - 6, colW - 2, 3);
        g.fillStyle(0x000000, 0.18);
        g.fillRect(bx + 1, ly + lh - 3, colW - 2, 3); // undershadow, tucked under the beam above
      }
      // Seam between the two pallets on this level.
      g.fillStyle(0x000000, 0.25);
      g.fillRect(a.x + 6 + colW - 1, ly, 2, lh);
    }

    // Uprights: a lit face and a shadowed face, so the post reads as round
    // steel tube rather than a flat orange bar.
    g.fillStyle(c.shelfFrameLit, 1);
    g.fillRect(a.x, a.y, 4, a.h);
    g.fillRect(a.x + a.w - 6, a.y, 4, a.h);
    g.fillStyle(c.shelfFrameShade, 1);
    g.fillRect(a.x + 4, a.y, 2, a.h);
    g.fillRect(a.x + a.w - 2, a.y, 2, a.h);

    // Diagonal bracing at the top and bottom of the frame, the way a real
    // pallet-racking end reads even from square-on.
    g.lineStyle(2, c.shelfFrameShade, 0.6);
    g.lineBetween(a.x + 3, a.y, a.x + a.w - 3, a.y + 30);
    g.lineBetween(a.x + a.w - 3, a.y, a.x + 3, a.y + 30);
    g.lineBetween(a.x + 3, a.y + a.h, a.x + a.w - 3, a.y + a.h - 30);
    g.lineBetween(a.x + a.w - 3, a.y + a.h, a.x + 3, a.y + a.h - 30);

    // Beams: a lit top edge over a shadowed underside, plus the shadow it
    // throws onto the pallet sitting below it.
    for (let y = a.y; y < a.y + a.h; y += beamStep) {
      g.fillStyle(c.shelfFrameLit, 1);
      g.fillRect(a.x, y, a.w, 3);
      g.fillStyle(c.shelfFrame, 1);
      g.fillRect(a.x, y + 3, a.w, 3);
      g.fillStyle(0x000000, 0.3);
      g.fillRect(a.x, y + 6, a.w, 3);

      // A shelf-edge price tag, the way a real warehouse aisle carries them.
      const tagX = a.x + 10 + (ai % 2) * (a.w - 40);
      g.fillStyle(0xf3ead9, 0.9);
      g.fillRect(tagX, y - 5, 24, 8);
      g.fillStyle(c.signRed, 0.9);
      g.fillRect(tagX + 2, y - 3, 8, 4);
    }
  }

  // ---------- the open floor in front of the racking ----------

  // Between the racking and the front end a club merchandises off the
  // floor rather than out of shelving: flat tables of folded apparel and
  // shrink-wrapped pallet displays of whatever is in season. Kept on the
  // racking's own grid, so every lane still runs clear from the back wall
  // to the registers.
  buildFrontFloor(g) {
    CFG.interior.frontTables.forEach((t, i) => {
      g.fillStyle(0x000000, 0.14);
      g.fillRect(t.x + 4, t.y + 4, t.w, t.h);
      if (t.kind === 'apparel') this.drawApparelTable(g, t, i);
      else this.drawPalletDisplay(g, t, i);
      this.blockZone(t);
    });
  }

  drawApparelTable(g, t, i) {
    const c = CFG.colors;
    g.fillStyle(c.tableTop, 1);
    g.fillRoundedRect(t.x, t.y, t.w, t.h, 5);
    g.fillStyle(0xffffff, 0.06);
    g.fillRect(t.x + 3, t.y + 3, t.w - 6, 3);

    // Folded stacks laid out across it, each catching a little light.
    const cloth = [0x4c6f8f, 0x8a5560, 0x5f7a5c, 0x7a6f4f, 0x6a5a78, 0x53707a];
    const cols = Math.floor((t.w - 10) / 28);
    const rows = Math.floor((t.h - 10) / 19);
    for (let cx = 0; cx < cols; cx++) {
      for (let ry = 0; ry < rows; ry++) {
        const col = cloth[(i * 3 + cx * 2 + ry * 5) % cloth.length];
        const x = t.x + 7 + cx * 28;
        const y = t.y + 7 + ry * 19;
        g.fillStyle(col, 1);
        g.fillRect(x, y, 24, 16);
        g.fillStyle(0xffffff, 0.13);
        g.fillRect(x, y, 24, 4);
        g.fillStyle(0x000000, 0.2);
        g.fillRect(x, y + 13, 24, 3);
      }
    }
  }

  drawPalletDisplay(g, t, i) {
    const c = CFG.colors;
    g.fillStyle(c.palletWood, 1); // the pallet, showing round the load
    g.fillRect(t.x, t.y, t.w, t.h);
    g.fillStyle(0x000000, 0.25);
    for (let x = t.x + 8; x < t.x + t.w - 4; x += 16) g.fillRect(x, t.y, 3, t.h);

    const pal = c.boxPalette;
    const bx = t.x + 6;
    const by = t.y + 6;
    const bw = t.w - 12;
    const bh = t.h - 12;
    const cols = 3;
    const cw = bw / cols;
    for (let n = 0; n < cols; n++) {
      g.fillStyle(pal[(i * 2 + n) % pal.length], 1);
      g.fillRect(bx + n * cw + 1, by, cw - 2, bh);
      g.fillStyle(0x000000, 0.22);
      g.fillRect(bx + n * cw + cw - 2, by, 2, bh);
    }
    // Shrink wrap over the whole load, and the hard highlight off it.
    g.fillStyle(0xffffff, 0.08);
    g.fillRect(bx, by, bw, bh);
    g.fillStyle(0xffffff, 0.16);
    g.fillRect(bx, by + 4, bw, 4);
  }

  // ---------- back of house ----------

  // Down the west wall, behind the trailer yard outside: the receiving
  // floor the docks unload onto, and the food court fronting the registers.
  // Receiving is a marked-out floor with pallets staged on it rather than a
  // sealed room — which is how a club actually uses the space, and it
  // leaves the break-room doorway a clear run out onto the sales floor.
  buildBackOfHouse(g) {
    const r = CFG.interior.receiving;
    this.hatchArea(g, r);
    this.interiorLabel(r.x + r.w / 2, r.y + 14, 'RECEIVING', 12, '#8d7b3f');

    // Two ranks of staged pallets with an aisle between them, lined up with
    // the break-room doorway so nothing ever corks it.
    const rankW = 100;
    [
      { x: r.x + 10, y: r.y + 34 },
      { x: r.x + r.w - rankW - 10, y: r.y + 34 },
      { x: r.x + 10, y: r.y + 200 },
      { x: r.x + r.w - rankW - 10, y: r.y + 200 },
    ].forEach((p, i) => {
      const t = { x: p.x, y: p.y, w: rankW, h: 106 };
      g.fillStyle(0x000000, 0.16);
      g.fillRect(t.x + 4, t.y + 4, t.w, t.h);
      this.drawPalletDisplay(g, t, i + 3);
      this.blockZone(t);
    });

    this.buildFoodCourt(g);
  }

  buildFoodCourt(g) {
    const fc = CFG.interior.foodCourt;
    const c = CFG.colors;

    // The servery: a counter with a menu board behind it and hot-hold wells
    // sunk into the top.
    const counter = { x: fc.x, y: fc.y, w: fc.w, h: 30 };
    g.fillStyle(c.signRed, 1);
    g.fillRect(counter.x, counter.y - 12, counter.w, 12); // menu board
    g.fillStyle(0x6a7482, 1);
    g.fillRect(counter.x, counter.y, counter.w, counter.h);
    g.fillStyle(0x9aa4b0, 1);
    g.fillRect(counter.x, counter.y + counter.h - 6, counter.w, 6);
    g.fillStyle(0x2d333a, 1);
    for (let x = counter.x + 14; x < counter.x + counter.w - 24; x += 46) {
      g.fillRect(x, counter.y + 7, 32, 14);
    }
    this.blockZone(counter);
    this.interiorLabel(fc.x + fc.w / 2, fc.y - 6, 'FOOD COURT', 11, '#e8d6cf');

    // Stand-up tables in front of it, on their own little tiled patch.
    g.fillStyle(0xb9c0c8, 0.5);
    g.fillRect(fc.x, fc.y + counter.h + 6, fc.w, fc.h - counter.h - 6);
    for (let i = 0; i < 3; i++) {
      const x = fc.x + 56 + i * 100;
      const y = fc.y + fc.h - 24;
      g.fillStyle(0x000000, 0.16);
      g.fillCircle(x + 3, y + 3, 17);
      g.fillStyle(0x7d8794, 1);
      g.fillCircle(x, y, 17);
      g.fillStyle(0xffffff, 0.1);
      g.fillCircle(x - 4, y - 4, 8);
    }
  }

  // A floor-marked working area: a yellow bounding stripe with diagonal
  // hatching inside it, the way a warehouse marks out ground a pallet jack
  // owns. Purely paint — nothing here blocks anybody.
  hatchArea(g, r) {
    const c = CFG.colors;
    g.lineStyle(3, c.floorStripe, 0.5);
    g.strokeRect(r.x, r.y, r.w, r.h);
    g.lineStyle(2, c.floorStripe, 0.14);
    for (let i = -r.h; i < r.w; i += 30) {
      const t0 = Math.max(0, -i);
      const t1 = Math.min(r.h, r.w - i);
      if (t1 <= t0) continue;
      g.lineBetween(r.x + i + t0, r.y + t0, r.x + i + t1, r.y + t1);
    }
  }

  // ---------- the front end ----------

  // Everything the doors open onto: the entrance flooring, the row of
  // registers across the front, the cart return, the nested carts waiting
  // for members and the receipt-check podium beside the exit.
  buildVestibule(g) {
    const v = CFG.interior.vestibule;
    this.drawFrontStrip(g);
    v.checkout.forEach((c, i) => this.buildCheckoutLane(g, c, i + 1));
    this.drawInteriorDropZone();
    v.cartStaging.forEach((s) => this.drawCartStaging(g, s));
    this.drawReceiptCheck(g, v.receiptCheck);
  }

  // The strip between the registers and the doors: tiled rather than bare
  // slab, the way the entrance run of a warehouse is, with walk-off matting
  // inside each doorway and a stripe keeping it clear of the lanes.
  drawFrontStrip(g) {
    const f = CFG.interior.floor;
    const c = CFG.colors;
    const t = CFG.interior.wallT;
    const y = 1008;

    g.fillStyle(0xb5bdc6, 1);
    g.fillRect(f.x1 + t, y, f.x2 - f.x1 - t * 2, f.y2 - y);
    g.lineStyle(1, 0x9ba3ad, 0.55);
    for (let x = f.x1 + t; x < f.x2 - t; x += 34) g.lineBetween(x, y, x, f.y2);
    for (let yy = y + 34; yy < f.y2; yy += 34) g.lineBetween(f.x1 + t, yy, f.x2 - t, yy);
    g.fillStyle(c.floorStripe, 0.3);
    g.fillRect(f.x1 + t + 30, y - 4, f.x2 - f.x1 - t * 2 - 60, 3);

    CFG.doors.forEach((d) => {
      g.fillStyle(0x333940, 1);
      g.fillRect(d.x - d.w / 2, f.y2 - 56, d.w, 42);
      g.fillStyle(0x3d444c, 1);
      for (let x = d.x - d.w / 2 + 4; x < d.x + d.w / 2 - 4; x += 12) {
        g.fillRect(x, f.y2 - 52, 6, 34);
      }
    });

    this.drawStorefrontFromInside(g);
  }

  // The storefront, seen from the side nobody in the lot sees: a solid
  // wall with the two doorways let into it, jambs and all. Without it the
  // floor simply stops at the bottom of the screen and the inside of the
  // store reads as open to the weather. It needs no collision — the clamp
  // in constrainToZone() stops players at its inner face, and the doorway
  // gaps are the same x/w the lot side uses, so the two line up.
  drawStorefrontFromInside(g) {
    const f = CFG.interior.floor;
    const c = CFG.colors;
    const t = 10;
    const y = f.y2 - t;

    const segs = [];
    let cursor = f.x1;
    CFG.doors.forEach((d) => {
      segs.push([cursor, d.x - d.w / 2]);
      cursor = d.x + d.w / 2;
    });
    segs.push([cursor, f.x2]);

    segs.forEach(([a, b]) => {
      if (b <= a) return;
      g.fillStyle(c.interiorWall, 1);
      g.fillRect(a, y, b - a, t);
      g.fillStyle(c.interiorWallFace, 1);
      g.fillRect(a, y, b - a, 3);
      g.fillStyle(0x000000, 0.1);
      for (let x = a; x < b; x += 48) g.fillRect(x, y, 2, t);
    });

    // Jambs either side of each doorway.
    g.fillStyle(0x2c333b, 1);
    CFG.doors.forEach((d) => {
      g.fillRect(d.x - d.w / 2 - 4, y - 3, 5, t + 3);
      g.fillRect(d.x + d.w / 2 - 1, y - 3, 5, t + 3);
    });
  }

  // One checkout lane: a belt feeding down from the sales floor, low rails
  // either side to queue shoppers into it, a counter with a register, card
  // terminal and bagging shelf, and an overhead lane number — the pieces a
  // real front-end lane is built from. Solid, so the front end is a wall of
  // registers with a walkway behind it rather than open floor.
  buildCheckoutLane(g, c, num) {
    const laneW = 74;
    const beltH = 66;
    const beltY = c.y - beltH - 6;

    g.fillStyle(0x000000, 0.15);
    g.fillRect(c.x - laneW / 2 + 3, beltY + 4, laneW, beltH + 46);

    g.fillStyle(0x30353c, 1);
    [c.x - laneW / 2, c.x + laneW / 2].forEach((x) => g.fillRect(x - 3, beltY, 6, beltH + 34));

    g.fillStyle(0x1e2126, 1);
    g.fillRect(c.x - laneW / 2 + 6, beltY, laneW - 12, beltH);
    g.fillStyle(0x565f6a, 1);
    for (let y = beltY + 6; y < beltY + beltH - 4; y += 12) {
      g.fillRect(c.x - laneW / 2 + 10, y, laneW - 20, 5); // belt tread
    }
    g.fillStyle(0xd8dee6, 0.7); // the divider bar, parked at the head of the belt
    g.fillRect(c.x - laneW / 2 + 12, beltY + 4, laneW - 24, 4);

    g.fillStyle(0x454c56, 1);
    g.fillRect(c.x - 45, c.y - 14, 90, 28); // worktop
    g.fillStyle(0x2c3138, 1);
    g.fillRect(c.x - 45, c.y - 14, 90, 6);
    g.fillStyle(0x1c2026, 1);
    g.fillRect(c.x - 40, c.y - 10, 20, 20); // register housing
    g.fillStyle(CFG.colors.doorGlass, 0.85);
    g.fillRect(c.x - 37, c.y - 7, 14, 10); // screen glow
    g.fillStyle(0x30353c, 1);
    g.fillRect(c.x - 14, c.y - 8, 12, 14); // card terminal on its post
    g.fillStyle(0x39424c, 1);
    g.fillRect(c.x + 18, c.y - 10, 24, 20); // bagging shelf

    this.blockZone({
      x: c.x - laneW / 2 - 3,
      y: beltY,
      w: laneW + 6,
      h: c.y + 16 - beltY,
    });

    g.fillStyle(CFG.colors.signBlue, 1);
    g.fillRoundedRect(c.x - 14, beltY - 24, 28, 18, 3);
    this.interiorLabel(c.x, beltY - 15, String(num), 13, '#e8eef5');

    // The cashier: stood behind the register, facing back up the belt
    // toward the aisles the way an actual one watches for the next customer.
    this.add.image(c.x - 26, c.y + 26, 'employee').setDepth(6).setRotation(-Math.PI / 2);
  }

  // Nested carts waiting for members. Drawn, not built out of real cart
  // objects: these are the store's stock, not the lot's, and an attendant
  // should not be able to peel one off the rank and hand it back in.
  drawCartStaging(g, s) {
    const w = 118;
    for (let r = 0; r < s.rows; r++) {
      const y = s.y + r * 28;
      g.fillStyle(0x000000, 0.14);
      g.fillRect(s.x + 3, y + 3, w, 20);
      g.fillStyle(0x8a9099, 1);
      g.fillRect(s.x, y, w, 20);
      g.fillStyle(CFG.colors.signRed, 0.8);
      g.fillRect(s.x, y, w, 5);
      g.lineStyle(1, 0x5d646d, 0.9);
      for (let x = s.x + 8; x < s.x + w - 4; x += 9) g.lineBetween(x, y + 6, x, y + 19);
    }
  }

  // The podium beside the exit door where a receipt gets its marker line.
  drawReceiptCheck(g, p) {
    g.fillStyle(0x000000, 0.16);
    g.fillRect(p.x - 15, p.y - 9, 34, 22);
    g.fillStyle(0x4a535e, 1);
    g.fillRect(p.x - 18, p.y - 12, 34, 22);
    g.fillStyle(0x9aa4b0, 1);
    g.fillRect(p.x - 18, p.y - 12, 34, 5);
    this.add.image(p.x + 6, p.y + 2, 'employee').setDepth(6).setRotation(Math.PI);
  }

  // ---------- overhead ----------

  // Everything above head height, on its own layer: over the players
  // (depth 8) but under the roof the lot sees (depth 15), so it shows from
  // inside and only from inside. Exposed roof structure, the high-bay
  // light rows hung off it, numbered aisle markers and department banners.
  // It is what gives the floor a ceiling — without it the interior reads
  // as a plan drawing rather than a room.
  buildInteriorOverhead() {
    const f = CFG.interior.floor;
    const c = CFG.colors;
    const t = CFG.interior.wallT;
    const g = this.add.graphics().setDepth(10);
    const x1 = f.x1 + t;
    const x2 = f.x2 - t;

    // Bar joists across the box, on the deeper trusses that carry them.
    g.fillStyle(c.joist, 0.07);
    for (let y = f.y1 + 30; y < f.y2 - 60; y += 58) g.fillRect(x1, y, x2 - x1, 2);
    g.fillStyle(c.joist, 0.08);
    for (let x = x1 + 130; x < x2; x += 265) g.fillRect(x, f.y1 + t, 4, f.y2 - f.y1 - t - 70);

    // A run of high-bay fixtures down every lane, each with the soft pool
    // of light it throws. The slab under them is already carrying the
    // reflection — see drawInteriorFloor().
    CFG.interior.aisleLaneX.forEach((x) => {
      for (let y = 396; y < f.y2 - 140; y += 118) {
        g.fillStyle(0xffffff, 0.05);
        g.fillRect(x - 14, y - 6, 28, 48);
        g.fillStyle(c.lightFixture, 0.45);
        g.fillRect(x - 7, y, 14, 36);
        g.fillStyle(0xffffff, 0.7);
        g.fillRect(x - 3, y + 4, 6, 28);
      }
    });

    // The structural columns the roof sits on, seen from directly below.
    // They stand inside the racking runs and the walk-in boxes, the way a
    // warehouse plans them — nowhere anybody walks, so they cost no
    // collision, and they tie the racking to the roof above it.
    g.fillStyle(0x2b3038, 0.5);
    CFG.interior.aisleCols.forEach((x) => {
      CFG.interior.aisleBays.forEach((bay) => {
        const cx = x + CFG.interior.aisleW / 2;
        const cy = bay.y + bay.h / 2;
        g.fillRect(cx - 11, cy - 11, 22, 22);
        g.fillStyle(0xffffff, 0.1);
        g.fillRect(cx - 11, cy - 11, 22, 4);
        g.fillStyle(0x2b3038, 0.5);
      });
    });

    // A club signs its ceiling, not its floor: a numbered marker hung over
    // the head of every lane, and a banner over every department.
    CFG.interior.aisleLaneX.forEach((x, i) => {
      this.hangingSign(x, CFG.interior.crossRows[0], String(i + 1), 15, c.signBlue, 34);
    });
    CFG.interior.departments.forEach((d) => {
      this.hangingSign(d.x + d.w / 2, d.y + d.h - 48, d.label, 13, c.signRed);
    });
  }

  // One sign hung off the roof structure, drawn over everyone's heads.
  hangingSign(x, y, text, size, color, w) {
    const width = w || text.length * 10 + 18;
    const h = size + 11;
    this.add.rectangle(x + 3, y + 5, width, h, 0x000000, 0.22).setDepth(11);
    this.add
      .rectangle(x, y, width, h, color, 0.95)
      .setStrokeStyle(2, 0xe8eef5, 0.45)
      .setDepth(12);
    this.interiorLabel(x, y, text, size, '#f0f5fa', 13);
  }

  // The staff break room: a walled-off room with a hinged door on its south
  // wall. This is now the attendant's spawn/respawn point, and walking in
  // heals a lost life on a cooldown — see updateBreakRoom(). The walls are
  // drawn at the same thickness as their collision zones below, with the
  // door itself drawn open — jambs, a swung leaf and its arc of travel, the
  // usual floor-plan convention — so the gap in the wall reads as a doorway
  // and not a hole in the room.
  buildBreakRoom(g) {
    const b = CFG.interior.breakRoom;
    const c = CFG.colors;
    // Vinyl tile rather than the sales floor's bare slab, which is what
    // actually changes underfoot when you step off the warehouse floor.
    g.fillStyle(c.breakRoomFloor, 1);
    g.fillRect(b.x, b.y, b.w, b.h);
    g.lineStyle(1, 0x9aa2aa, 0.35);
    for (let x = b.x + 30; x < b.x + b.w; x += 30) g.lineBetween(x, b.y, x, b.y + b.h);
    for (let y = b.y + 30; y < b.y + b.h; y += 30) g.lineBetween(b.x, y, b.x + b.w, y);

    // Lockers along the north wall, then the vending machines and the
    // counter with the urn on it — the whole of a real staff room.
    g.fillStyle(0x4d5866, 1);
    g.fillRect(b.x + 8, b.y + 6, 132, 26);
    g.fillStyle(0x2f363f, 1);
    for (let x = b.x + 14; x < b.x + 134; x += 22) g.fillRect(x, b.y + 10, 18, 18);
    g.fillStyle(0x8f98a3, 0.7);
    for (let x = b.x + 14; x < b.x + 134; x += 22) g.fillRect(x + 13, b.y + 17, 3, 5);

    [0x8a3f3a, 0x35617f].forEach((col, i) => {
      const x = b.x + 156 + i * 60;
      g.fillStyle(0x000000, 0.16);
      g.fillRect(x + 3, b.y + 9, 52, 30);
      g.fillStyle(col, 1);
      g.fillRect(x, b.y + 6, 52, 30);
      g.fillStyle(0x1a1e24, 1);
      g.fillRect(x + 5, b.y + 11, 30, 20);
      g.fillStyle(0xffffff, 0.12);
      g.fillRect(x + 5, b.y + 11, 30, 5);
    });

    // table + four chairs, off centre, with the counter down the east wall
    const cx = b.x + b.w / 2 - 26;
    const cy = b.y + b.h / 2 + 22;
    g.fillStyle(0x000000, 0.14);
    g.fillRoundedRect(cx - 37, cy - 21, 80, 48, 8);
    g.fillStyle(0x5a4632, 1);
    g.fillRoundedRect(cx - 40, cy - 24, 80, 48, 8);
    g.fillStyle(0xffffff, 0.07);
    g.fillRoundedRect(cx - 40, cy - 24, 80, 12, 6);
    g.fillStyle(0x394048, 1);
    [
      [-55, -20],
      [55, -20],
      [-55, 20],
      [55, 20],
    ].forEach(([dx, dy]) => g.fillCircle(cx + dx, cy + dy, 10));

    g.fillStyle(0x7c8592, 1);
    g.fillRect(b.x + b.w - 34, b.y + 62, 30, 110); // counter down the east wall
    g.fillStyle(0x9aa4b0, 1);
    g.fillRect(b.x + b.w - 34, b.y + 62, 6, 110);
    g.fillStyle(0x2f363f, 1);
    g.fillRect(b.x + b.w - 26, b.y + 74, 16, 20); // the urn
    g.fillStyle(0xd8dee6, 1);
    g.fillRect(b.x + b.w - 24, b.y + 112, 12, 14); // and the microwave
    g.fillStyle(0x1a1e24, 1);
    g.fillRect(b.x + b.w - 22, b.y + 115, 8, 8);

    this.interiorLabel(b.x + 68, b.y + 50, 'BREAK ROOM', 13, '#5b6672');

    // Walls, minus the doorway gap on the south side — drawn solid, at the
    // same thickness the zones below use, with a lighter cap along the
    // inner edge so they read as a raised partition rather than a line.
    const t = 10;
    const walls = [
      { x: b.x - t / 2, y: b.y - t / 2, w: b.w + t, h: t }, // north
      { x: b.x - t / 2, y: b.y, w: t, h: b.h }, // west
      { x: b.x + b.w, y: b.y, w: t, h: b.h }, // east
      { x: b.x, y: b.y + b.h, w: b.doorX - b.x, h: t }, // south, left of the door
      {
        x: b.doorX + b.doorW,
        y: b.y + b.h,
        w: b.x + b.w - (b.doorX + b.doorW),
        h: t,
      }, // south, right of the door
    ];
    walls.forEach((w) => {
      if (w.w <= 0 || w.h <= 0) return;
      g.fillStyle(c.interiorWall, 1);
      g.fillRect(w.x, w.y, w.w, w.h);
      g.fillStyle(c.wallTrim, 0.5);
      g.fillRect(w.x, w.y, w.w, 2);

      const zone = this.add.zone(w.x + w.w / 2, w.y + w.h / 2, w.w, w.h);
      this.physics.add.existing(zone, true);
      this.scenery.add(zone);
    });

    // The door itself: jambs at the gap, a leaf swung open into the room and
    // resting against the inside of the wall, and the quarter-circle arc it
    // swept through to get there.
    const hingeX = b.doorX;
    const hingeY = b.y + b.h;
    const leafLen = b.doorW - 8;
    g.fillStyle(0x181b20, 1);
    g.fillRect(b.doorX - 3, hingeY - 5, 4, 12);
    g.fillRect(b.doorX + b.doorW - 1, hingeY - 5, 4, 12);

    g.lineStyle(1, c.wallTrim, 0.4);
    g.beginPath();
    g.arc(hingeX, hingeY, leafLen, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(270), false);
    g.strokePath();

    g.fillStyle(0x6b5636, 1);
    g.fillRect(hingeX - 2, hingeY - leafLen, 4, leafLen);
  }

  buildCorrals() {
    const g = this.add.graphics().setDepth(1);
    this.carts = [];

    const c = CFG.colors;
    CFG.corrals.forEach((def) => {
      const w = CFG.stallW * 3;
      const h = CFG.stallH - 16;
      const x = def.x - w / 2;
      const y = def.y - h / 2;

      // The bay it stands in is painted out, and the steel throws a shadow
      // on it the same way everything else on the lot does.
      g.fillStyle(0x000000, 0.22);
      g.fillRect(x + 4, y + 5, w, h);
      g.fillStyle(0xffe9a8, 0.12);
      g.fillRect(x, y, w, h);
      g.fillStyle(c.stallStripe, 0.3);
      g.fillRect(x, y - 3, w, 3);

      g.lineStyle(3, c.corralRail, 0.9);
      g.strokeRoundedRect(x, y, w, h, 6);
      g.lineStyle(2, c.corralRail, 0.35);
      g.strokeRoundedRect(x + 7, y + 7, w - 14, h - 14, 4);

      // Uprights at the corners and along the rails, and the sign over the
      // open end telling you which end to push a train into.
      [x, x + w / 2, x + w].forEach((px) => {
        [y, y + h].forEach((py) => {
          g.fillStyle(0x000000, 0.3);
          g.fillCircle(px + 2, py + 3, 5);
          g.fillStyle(c.corralRail, 0.95);
          g.fillCircle(px, py, 5);
        });
      });
      g.fillStyle(c.signBlue, 0.9);
      g.fillRect(def.x - 26, y - 20, 52, 14);
      g.fillStyle(0xd8e2ec, 0.8);
      g.fillRect(def.x - 20, y - 16, 40, 3);
      g.fillRect(def.x - 20, y - 11, 26, 3);
    });

    this.spawnCarts();
  }

  addCart(x, y, home) {
    const cart = {
      sprite: this.add.image(x, y, 'cart').setDepth(4),
      home,
      state: 'idle',
      claimedBy: null,
    };
    this.carts.push(cart);
    return cart;
  }

  // The carts a lot opens with. The target is a quota, not a headcount: the
  // store keeps sending more out, so it is deliveries that clear the lot.
  spawnCarts() {
    CFG.corrals.forEach((def) => {
      for (let i = 0; i < def.carts; i++) {
        const home = { x: def.x - ((def.carts - 1) * 44) / 2 + i * 44, y: def.y };
        this.addCart(home.x, home.y, home);
      }
    });
    this.cartsTotal = CFG.levelQuota;
    this.cartsDelivered = 0;
  }

  // ---------- cameras ----------

  // Solo gets one following camera. Two-player splits the viewport down the
  // middle and gives each player their own, because the lot is far too big for
  // both of them to share a frame.
  setupCameras() {
    const V = CFG.view;
    this.views = [];

    const main = this.cameras.main;
    main.setBounds(0, 0, CFG.width, CFG.height);
    main.setRoundPixels(true);

    if (this.players.length === 1) {
      main.setViewport(0, 0, V.w, V.h);
      main.startFollow(this.players[0].sprite, true, CFG.camera.lerp, CFG.camera.lerp);
      this.views.push(main);
    } else {
      // A few pixels of canvas background show between the halves as a seam.
      const halfW = Math.floor(V.w / 2) - 3;
      main.setViewport(0, 0, halfW, V.h);
      main.setZoom(CFG.camera.splitZoom);
      main.startFollow(this.players[0].sprite, true, CFG.camera.lerp, CFG.camera.lerp);
      this.views.push(main);

      const right = this.cameras.add(V.w - halfW, 0, halfW, V.h);
      right.setBounds(0, 0, CFG.width, CFG.height);
      right.setRoundPixels(true);
      right.setZoom(CFG.camera.splitZoom);
      right.startFollow(this.players[1].sprite, true, CFG.camera.lerp, CFG.camera.lerp);
      this.views.push(right);
    }

    this.buildMinimap();
  }

  // Corner map of the whole lot. It is a real camera looking at the same world,
  // zoomed right out, plus a blip layer the main cameras are told to ignore —
  // at this scale a cart is a third of a pixel, so it needs drawing big.
  buildMinimap() {
    const V = CFG.view;
    const m = CFG.camera;
    const zoom = Math.min(m.mapW / CFG.width, m.mapH / CFG.height);

    this.blips = this.add.graphics().setDepth(40);
    this.views.forEach((cam) => cam.ignore(this.blips));

    // Solo tucks it in the corner; split screen centres it on the seam, so it
    // sits at the same distance from both players' eyes.
    const mx = this.views.length > 1 ? (V.w - m.mapW) / 2 : V.w - m.mapW - 16;
    this.minimap = this.cameras
      .add(mx, V.h - m.mapH - 16, m.mapW, m.mapH)
      .setZoom(zoom)
      .setName('minimap');
    // No bounds: the map is zoomed out past the world, so it just sits centred.
    this.minimap.centerOn(CFG.width / 2, CFG.height / 2);
    this.drawBlips();
  }

  drawBlips() {
    const g = this.blips;
    if (!g) return;
    g.clear();

    const pv = CFG.pavement;
    g.fillStyle(0x0b0e12, 0.55);
    g.fillRect(-CFG.width, -CFG.height, CFG.width * 3, CFG.height * 3);
    g.lineStyle(14, 0x6fa8d4, 0.5);
    g.strokeRect(pv.x, pv.y, pv.w, pv.h);

    // where each player is currently looking
    g.lineStyle(10, 0xe8eef5, 0.35);
    this.views.forEach((cam) => {
      const w = cam.worldView;
      g.strokeRect(w.x, w.y, w.width, w.height);
    });

    // The cart return is inside now, but the doors are still the landmark
    // that matters on the map — that's where a full train needs to head.
    const dz = CFG.dropZone;
    g.fillStyle(0x7fd6a6, 0.9);
    g.fillRect(dz.x - 150, dz.y - 70, 300, 140);

    this.carts.forEach((c) => {
      if (c.state === 'idle') {
        g.fillStyle(0xd8dee6, 1);
        g.fillCircle(c.sprite.x, c.sprite.y, 30);
      } else if (c.state === 'ped') {
        // being tidied away by a shopper: still yours if you get there first
        g.fillStyle(0xd8dee6, 0.45);
        g.fillCircle(c.sprite.x, c.sprite.y, 24);
      }
    });

    this.powerups.forEach((pu) => {
      g.fillStyle(0x0e1116, 1);
      g.fillCircle(pu.x, pu.y, 38);
      g.fillStyle(pu.def.color, 1);
      g.fillCircle(pu.x, pu.y, 28);
    });

    // Hazards read as hollow rings, so they never look like a cart or a badge.
    this.obstacles.forEach((ob) => {
      g.lineStyle(14, ob.def.color, ob.alerted() ? 1 : 0.55);
      g.strokeCircle(ob.x, ob.y, 30);
    });

    // The forklift, whenever it is out on the asphalt — parked somewhere
    // you left it, or under somebody right now. Amber, and square, so it
    // never reads as a cart or a badge.
    const f = this.forklift;
    if (f && (f.rider ? f.rider.zone === 'lot' : f.zone === 'lot')) {
      g.fillStyle(0xf2b338, 1);
      g.fillRect(f.sprite.x - 34, f.sprite.y - 34, 68, 68);
    }

    this.players.forEach((p) => {
      if (!p.alive || p.zone !== 'lot') return;
      g.fillStyle(0x0e1116, 1);
      g.fillCircle(p.x, p.y, 54);
      g.fillStyle(p.tint, 1);
      g.fillCircle(p.x, p.y, 42);
    });
  }

  // ---------- traffic ----------

  buildTraffic() {
    this.lanes = CFG.aisles.map((def) => ({ ...def, sprites: [] }));
    this.linkTurns();
    this.lanes.forEach((lane) => this.prefillLane(lane));
    this.buildCrossings();
  }

  // A drive that dead-ends on the storefront has to conjure its cars out of the
  // sidewalk. So wherever a lane ends on another lane, the two are joined up:
  // a car turns off the end of one onto the next, and the only places a car
  // appears or disappears are the edges of the map.
  linkTurns() {
    const meets = (lane, coord) =>
      this.lanes.find(
        (l) =>
          l.axis !== lane.axis &&
          l.pos === coord &&
          lane.pos > this.laneFrom(l) &&
          lane.pos < this.laneTo(l)
      );

    this.lanes.forEach((lane) => {
      lane.turnAtFrom = meets(lane, this.laneFrom(lane));
      lane.turnAtTo = meets(lane, this.laneTo(lane));
      lane.entryFrom = lane.dir === 1 ? lane.turnAtFrom : lane.turnAtTo;
      lane.exitTo = lane.dir === 1 ? lane.turnAtTo : lane.turnAtFrom;
    });
  }

  // Each aisle/drive-lane crossing gets its own signal, actuated by cars on the
  // drive lane. Sparse traffic then means an aisle car almost never waits.
  buildCrossings() {
    const half = CFG.laneWidth / 2 + 8;
    this.crossings = [];

    this.lanes
      .filter((v) => v.axis === 'y')
      .forEach((vLane) => {
        this.lanes
          .filter((h) => h.axis === 'x')
          .forEach((hLane) => {
            if (hLane.pos <= this.laneFrom(vLane) || hLane.pos >= this.laneTo(vLane)) return;
            const crossing = {
              x: vLane.pos,
              y: hLane.pos,
              lane: vLane,
              state: 'x',
              since: 0,
              greenAxis: 'x',
              dots: [],
            };
            [
              { axis: 'x', x: vLane.pos - half, y: hLane.pos - half },
              { axis: 'y', x: vLane.pos + half, y: hLane.pos - half },
            ].forEach((spot) => {
              const dot = this.add.circle(spot.x, spot.y, 5, 0xc9524f, 0.9).setDepth(6);
              dot.axis = spot.axis;
              crossing.dots.push(dot);
            });
            this.crossings.push(crossing);
          });
      });
  }

  laneExtent(lane) {
    return lane.axis === 'x' ? CFG.width : CFG.height;
  }

  // An end that is a turn starts flush with the junction; an end that is the
  // map edge starts a car's length beyond it, already rolling in.
  prefillLane(lane) {
    const from = this.laneFrom(lane) - (lane.turnAtFrom ? 0 : 100);
    const to = this.laneTo(lane) + (lane.turnAtTo ? 0 : 100);
    const start = Phaser.Math.Between(0, lane.gap);
    for (let c = from + start; c < to; c += lane.gap) {
      this.spawnVehicle(lane, c);
    }
  }

  spawnVehicle(lane, coord) {
    const key = Phaser.Utils.Array.GetRandom(BootScene.TRAFFIC_KEYS);
    const sprite =
      lane.axis === 'x'
        ? this.add.image(coord, lane.pos, key).setFlipX(lane.dir === -1)
        : this.add.image(lane.pos, coord, key).setAngle(lane.dir === 1 ? 90 : -90);
    sprite.setDepth(7);

    // Park off-lane spawns clear of the despawn margin, which scales with the
    // car's own length — otherwise a short car is culled the frame it appears.
    const from = this.laneFrom(lane);
    const to = this.laneTo(lane);
    let c = coord;
    if (c < from) c = from - (sprite.width / 2 + 30);
    else if (c > to) c = to + sprite.width / 2 + 30;
    if (lane.axis === 'x') sprite.x = c;
    else sprite.y = c;

    lane.sprites.push(sprite);
  }

  // Cars on a vertical drive give way at the aisle crossings instead of
  // driving straight through the horizontal traffic.
  // A crossing is "in demand" when a drive-lane car is closing on it.
  demandAt(crossing) {
    const lane = crossing.lane;
    return lane.sprites.some((car) => {
      const ahead = lane.dir === 1 ? crossing.y - car.y : car.y - crossing.y;
      return ahead > 0 && ahead < CFG.lights.demandRange;
    });
  }

  updateLights(now) {
    const L = CFG.lights;
    this.crossings.forEach((c) => {
      const held = now - c.since;
      const demand = this.demandAt(c);
      const to = (state) => {
        c.state = state;
        c.since = now;
      };

      if (c.state === 'x') {
        if (demand && held >= L.minXGreen) to('red-y');
      } else if (c.state === 'red-y') {
        if (held >= L.allRed) to('y');
      } else if (c.state === 'y') {
        if (held >= L.yGreen || (!demand && held >= L.minYGreen)) to('red-x');
      } else if (held >= L.allRed) {
        to('x');
      }

      c.greenAxis = c.state === 'x' ? 'x' : c.state === 'y' ? 'y' : null;
      c.dots.forEach((dot) =>
        dot.setFillStyle(dot.axis === c.greenAxis ? 0x5ad18a : 0xc9524f, 0.9)
      );
    });
  }

  // Nobody drives through anybody: a car already straddling a crossing commits
  // and clears it, everyone else stops for occupied road ahead or a red light.
  mustYield(sprite, lane) {
    const b = sprite.getBounds();
    const half = CFG.laneWidth / 2;
    const vertical = lane.axis === 'y';

    const straddling = this.lanes.some(
      (l) =>
        l.axis !== lane.axis &&
        (vertical
          ? b.top < l.pos + half && b.bottom > l.pos - half
          : b.left < l.pos + half && b.right > l.pos - half)
    );
    if (straddling) return false;

    const look = 46;
    const probe = vertical
      ? new Phaser.Geom.Rectangle(
          b.x + 4,
          lane.dir === 1 ? b.bottom : b.top - look,
          b.width - 8,
          look
        )
      : new Phaser.Geom.Rectangle(
          lane.dir === 1 ? b.right : b.left - look,
          b.y + 4,
          look,
          b.height - 8
        );

    const roadAheadOccupied = this.lanes.some((l) =>
      l.sprites.some(
        (other) =>
          other !== sprite &&
          Phaser.Geom.Intersects.RectangleToRectangle(probe, other.getBounds())
      )
    );
    if (roadAheadOccupied) return true;

    // Coming up on the end of a lane that turns onto another, hold at the
    // give-way line until there is a gap in the traffic being joined.
    if (lane.exitTo) {
      const mark = lane.dir === 1 ? this.laneTo(lane) : this.laneFrom(lane);
      const lead = vertical
        ? lane.dir === 1
          ? b.bottom
          : b.top
        : lane.dir === 1
          ? b.right
          : b.left;
      const toMark = (mark - lead) * lane.dir;
      if (toMark > 0 && toMark < 140 && !this.turnGapClear(lane, lane.exitTo)) return true;
    }

    // Stop only for the crossing this car is actually running into, and only
    // while that crossing is not showing green for this direction of travel.
    return this.crossings.some((c) => {
      if (c.greenAxis === lane.axis) return false;
      const box = new Phaser.Geom.Rectangle(
        c.x - half,
        c.y - half,
        CFG.laneWidth,
        CFG.laneWidth
      );
      return Phaser.Geom.Intersects.RectangleToRectangle(probe, box);
    });
  }

  // The stretch of the joined lane a turning car needs to itself: the junction
  // box, plus the headway upstream of it.
  turnGapClear(lane, next) {
    const half = CFG.laneWidth / 2;
    const head = 210;
    const x = next.axis === 'x' ? lane.pos : next.pos;
    const y = next.axis === 'x' ? next.pos : lane.pos;
    const box =
      next.axis === 'x'
        ? new Phaser.Geom.Rectangle(
            next.dir === 1 ? x - head : x - half,
            y - half,
            head + half,
            CFG.laneWidth
          )
        : new Phaser.Geom.Rectangle(
            x - half,
            next.dir === 1 ? y - head : y - half,
            CFG.laneWidth,
            head + half
          );
    return !next.sprites.some((o) =>
      Phaser.Geom.Intersects.RectangleToRectangle(box, o.getBounds())
    );
  }

  // Did this step carry the car over `mark`, travelling the lane's way?
  passed(lane, was, now, mark) {
    return lane.dir === 1 ? was < mark && now >= mark : was > mark && now <= mark;
  }

  // Hand a car to `next`, sitting it in the junction the two lanes share and
  // squaring it up to its new direction of travel.
  turnOnto(sprite, lane, next) {
    sprite.setPosition(
      next.axis === 'x' ? lane.pos : next.pos,
      next.axis === 'x' ? next.pos : lane.pos
    );
    if (next.axis === 'x') sprite.setAngle(0).setFlipX(next.dir === -1);
    else sprite.setAngle(next.dir === 1 ? 90 : -90).setFlipX(false);
    next.sprites.push(sprite);
  }

  updateLane(lane, dt) {
    const v = lane.dir * lane.speed * this.speedMul * dt;
    const from = this.laneFrom(lane);
    const to = this.laneTo(lane);
    const exit = lane.dir === 1 ? to : from;

    for (let i = lane.sprites.length - 1; i >= 0; i--) {
      const s = lane.sprites[i];
      const was = lane.axis === 'x' ? s.x : s.y;
      if (!this.mustYield(s, lane)) {
        if (lane.axis === 'x') s.x += v;
        else s.y += v;
      }

      const coord = lane.axis === 'x' ? s.x : s.y;

      // Off the end of this lane and onto the one it runs into...
      if (lane.exitTo && this.passed(lane, was, coord, exit)) {
        lane.sprites.splice(i, 1);
        this.turnOnto(s, lane, lane.exitTo);
        continue;
      }

      // ...or off it partway along, into a drive waiting to be fed from here.
      const wanting = this.lanes.find(
        (l) => l.entryFrom === lane && l.wantsCar && this.passed(lane, was, coord, l.pos)
      );
      if (wanting) {
        lane.sprites.splice(i, 1);
        wanting.wantsCar = false;
        this.turnOnto(s, lane, wanting);
        continue;
      }

      // Despawn well outside the spawn edge, so a fresh car is never culled
      // on its first frame. Texture length always runs along travel.
      const margin = s.width / 2 + 60;
      if (coord < from - margin || coord > to + margin) {
        s.destroy();
        lane.sprites.splice(i, 1);
      }
    }

    const coords = lane.sprites.map((s) => (lane.axis === 'x' ? s.x : s.y));
    const room =
      coords.length === 0 ||
      (lane.dir === 1
        ? Math.min(...coords) >= from + lane.gap - 90
        : Math.max(...coords) <= to + 90 - lane.gap);
    if (!room) return;

    // A lane fed by a turn never conjures a car of its own: it puts its hand up
    // and takes the next one off the lane that feeds it.
    if (lane.entryFrom) lane.wantsCar = true;
    else this.spawnVehicle(lane, lane.dir === 1 ? from - 90 : to + 90);
  }

  // ---------- pedestrians ----------

  buildPeds() {
    this.peds = this.physics.add.group();
    for (let i = 0; i < CFG.peds.count; i++) this.spawnPed();
    this.physics.add.collider(this.peds, this.scenery, (ped) => this.unstick(ped));
  }

  // `at` places them somewhere specific — the store doorway, for a shopper the
  // store has just sent out. Left off, they simply appear on the walkways.
  spawnPed(at) {
    const spot = at || this.randomWalkPoint();
    const ped = this.peds
      .create(spot.x, spot.y, Phaser.Utils.Array.GetRandom(BootScene.PED_KEYS))
      .setDepth(6);
    ped.body.setCircle(9, 5, 3);
    ped.setCollideWorldBounds(true);
    ped.cart = null;
    ped.fetching = null;
    ped.pauseUntil = 0;
    ped.downUntil = 0; // flattened by the forklift; see flattenPed()
    ped.stuck = 0;
    ped.stuckAt = -99;
    this.retarget(ped);
    return ped;
  }

  // ---------- the walkway network ----------

  // Index of the walkway a point is standing on, or -1 out among the cars.
  walkAt(x, y) {
    return CFG.walks.findIndex(
      (w) => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h
    );
  }

  // Closest point on the network to somewhere off it, and which walkway it is on.
  nearestWalk(x, y) {
    let best = null;
    CFG.walks.forEach((w, i) => {
      const px = Phaser.Math.Clamp(x, w.x + 6, w.x + w.w - 6);
      const py = Phaser.Math.Clamp(y, w.y + 6, w.y + w.h - 6);
      const d = Phaser.Math.Distance.Between(x, y, px, py);
      if (!best || d < best.d) best = { i, x: px, y: py, d };
    });
    return best;
  }

  randomWalkPoint() {
    // Weighted by area, so the long storefront sees more of the crowd than the
    // two spines do.
    const total = CFG.walks.reduce((n, w) => n + w.w * w.h, 0);
    let pick = Math.random() * total;
    const w = CFG.walks.find((k) => (pick -= k.w * k.h) <= 0) || CFG.walks[0];
    return {
      x: Phaser.Math.Between(w.x + 8, w.x + w.w - 8),
      y: Phaser.Math.Between(w.y + 8, w.y + w.h - 8),
    };
  }

  // Somewhere a shopper can actually stand. Random points in the field land
  // inside parked cars; the driving aisles are the open ground between rows,
  // which is where you really walk out to your car.
  randomLotPoint() {
    const aisle = Phaser.Utils.Array.GetRandom(CFG.aisles.filter((a) => a.axis === 'x'));
    return {
      x: Phaser.Math.Between(CFG.lot.x1 + 60, CFG.lot.x2 - 60),
      y: aisle.pos + Phaser.Math.Between(-32, 32),
    };
  }

  // Waypoints from wherever the shopper is to wherever they are going, keeping
  // them on the network in between. The trunk-and-spines shape means at most
  // two junctions are ever involved, so no real pathfinding is needed.
  routeTo(ped, dest) {
    const route = [];
    const here = this.walkAt(ped.x, ped.y);
    const from = here >= 0 ? { i: here } : this.nearestWalk(ped.x, ped.y);
    if (here < 0) route.push({ x: from.x, y: from.y });

    const there = this.walkAt(dest.x, dest.y);
    const to = there >= 0 ? { i: there } : this.nearestWalk(dest.x, dest.y);

    if (from.i !== to.i) {
      // Step out to the trunk and back in, skipping the trunk's own null link.
      [CFG.walks[from.i].link, CFG.walks[to.i].link].forEach((l) => {
        if (l) route.push({ x: l.x, y: l.y });
      });
    }
    if (there < 0) route.push({ x: to.x, y: to.y });
    route.push({ x: dest.x, y: dest.y });

    ped.route = route;
    ped.stuck = 0;
  }

  // ---------- what a shopper does next ----------

  retarget(ped) {
    ped.pauseUntil = 0;

    // Still holding a cart: finish the job before doing anything else.
    if (ped.cart) {
      ped.goal = 'tidy';
      ped.dropAt = this.corralSlot(ped.cart.sprite.x, ped.cart.sprite.y);
      this.routeTo(ped, ped.dropAt);
      return;
    }

    this.releaseClaim(ped);

    // The store has been sending people out, so the lot is carrying more of a
    // crowd than it should: whoever finishes a trip next goes back inside.
    if (this.crowdSize() > this.pedTarget) {
      ped.goal = 'leave';
      this.routeTo(ped, this.doorPoint(0));
      return;
    }

    const roll = Math.random();

    if (roll < CFG.peds.tidyChance) {
      const stray = this.findStray(ped);
      if (stray) {
        ped.goal = 'fetch';
        ped.fetching = stray;
        stray.claimedBy = ped;
        this.routeTo(ped, { x: stray.sprite.x, y: stray.sprite.y });
        return;
      }
    }
    if (roll < CFG.peds.tidyChance + CFG.peds.errandChance) {
      ped.goal = 'errand';
      this.routeTo(ped, this.randomLotPoint());
      return;
    }
    ped.goal = 'stroll';
    this.routeTo(ped, this.randomWalkPoint());
  }

  // A cart is stray once it is loose somewhere that isn't a corral. Carts still
  // sitting in a corral are left alone, and so are ones another shopper claimed.
  findStray(ped) {
    let best = null;
    this.carts.forEach((cart) => {
      if (cart.state !== 'idle' || cart.claimedBy) return;
      if (this.inCorral(cart.sprite.x, cart.sprite.y)) return;
      const d = Phaser.Math.Distance.Between(ped.x, ped.y, cart.sprite.x, cart.sprite.y);
      if (d > CFG.peds.strayRange) return;
      if (!best || d < best.d) best = { cart, d };
    });
    return best && best.cart;
  }

  releaseClaim(ped) {
    if (ped.fetching && ped.fetching.claimedBy === ped) ped.fetching.claimedBy = null;
    ped.fetching = null;
  }

  // How full a corral is. Carts already on their way there count, or two
  // shoppers heading for the same bay would both read it as empty.
  corralLoad(corral) {
    const inBay = (x, y) =>
      Math.abs(x - corral.x) < CFG.stallW * 1.5 + 18 &&
      Math.abs(y - corral.y) < CFG.stallH / 2;

    let n = this.carts.filter((c) => c.state === 'idle' && inBay(c.sprite.x, c.sprite.y)).length;
    this.peds.children.iterate((ped) => {
      if (ped && ped.cart && ped.dropAt && inBay(ped.dropAt.x, ped.dropAt.y)) n += 1;
    });
    return n;
  }

  openCorrals() {
    return CFG.corrals.filter((c) => this.corralLoad(c) < CFG.restock.corralCap);
  }

  // Where the store sends the next cart: the emptiest bay that still has room.
  // Restocking follows the attendants around the lot that way — whichever
  // corral they just cleared out is the one that fills back up.
  emptiestCorral() {
    const open = this.openCorrals().map((c) => ({ c, load: this.corralLoad(c) }));
    if (open.length === 0) return null;
    Phaser.Utils.Array.Shuffle(open); // random tiebreak between equally empty bays
    return open.reduce((a, b) => (b.load < a.load ? b : a)).c;
  }

  // One bay within a corral to set a cart down in.
  corralBay(corral) {
    const slot = Phaser.Math.Between(0, corral.carts - 1);
    return { x: corral.x - ((corral.carts - 1) * 44) / 2 + slot * 44, y: corral.y };
  }

  // A free-ish bay in whichever corral is closest to where the cart was found,
  // skipping any that are already packed out.
  corralSlot(x, y) {
    const open = this.openCorrals();
    const pool = open.length ? open : CFG.corrals;
    let best = pool[0];
    let bestD = Infinity;
    pool.forEach((c) => {
      const d = Phaser.Math.Distance.Between(x, y, c.x, c.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    });
    return this.corralBay(best);
  }

  // ---------- the store restocking the lot ----------

  buildRestock() {
    this.nextShopperAt = this.time.now + CFG.restock.firstDelay * 1000;
  }

  liveCarts() {
    return this.carts.filter((c) => c.state !== 'done').length;
  }

  // Shoppers already walking back to the door don't count towards the crowd:
  // they are on their way off the lot, and counting them would keep flagging
  // surplus that is already leaving until the whole crowd had gone home.
  crowdSize() {
    let n = 0;
    this.peds.children.iterate((ped) => {
      if (ped && !ped.leaving && ped.goal !== 'leave') n += 1;
    });
    return n;
  }

  // Where shoppers step out of the store and back into it. The east door is the
  // exit and the west one the entry, which is how the storefront is drawn.
  doorPoint(which) {
    const d = CFG.doors[which];
    const spread = Math.min(CFG.restock.doorSpread, d.w / 2 - 10);
    return { x: d.x + Phaser.Math.Between(-spread, spread), y: CFG.sidewalk.y + 22 };
  }

  // Someone finishes their shop and wheels the cart out of the exit door. They
  // rack it in a corral and then carry on as an ordinary shopper — which is
  // what keeps the corrals stocked while the attendants haul trains away.
  sendShopperOut() {
    if (this.liveCarts() >= CFG.restock.maxCarts) return false;
    const corral = this.emptiestCorral();
    if (!corral) return false;

    const at = this.doorPoint(1);
    const ped = this.spawnPed(at);
    this.releaseClaim(ped); // spawning retargets them; that trip is cancelled

    const bay = this.corralBay(corral);
    const cart = this.addCart(at.x, at.y, bay);
    cart.state = 'ped';
    cart.sprite.setDepth(5);

    ped.cart = cart;
    ped.goal = 'tidy';
    ped.dropAt = bay;
    this.routeTo(ped, bay);

    // Fade both up, so they walk out of the doorway rather than popping into
    // existence on the sidewalk.
    [ped, cart.sprite].forEach((o) => {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 320 });
    });
    return true;
  }

  updateRestock(now) {
    if (now < this.nextShopperAt) return;
    this.sendShopperOut();
    const [lo, hi] = CFG.restock.interval;
    this.nextShopperAt = now + Phaser.Math.Between(lo, hi) * 1000;
  }

  // ---------- movement ----------

  updatePeds(now) {
    const speed = CFG.peds.speed * this.speedMul;
    this.peds.children.iterate((ped) => {
      if (!ped || ped.leaving) return;
      if (ped.cart) this.carryCart(ped);

      if (now < ped.pauseUntil) {
        ped.body.setVelocity(0, 0);
        return;
      }
      if (!ped.route || ped.route.length === 0) {
        this.retarget(ped);
        return;
      }

      const next = ped.route[0];
      if (Phaser.Math.Distance.Between(ped.x, ped.y, next.x, next.y) < CFG.peds.reach) {
        ped.route.shift();
        if (ped.route.length === 0) {
          this.pedArrived(ped, now);
          return;
        }
      }
      // Only stop to browse out among the cars, not in the middle of a walkway.
      if (ped.goal !== 'stroll' && Math.random() < CFG.peds.pauseChance) {
        ped.pauseUntil = now + Phaser.Math.Between(500, 1600);
        return;
      }

      this.physics.moveTo(ped, next.x, next.y, speed);
      ped.setRotation(ped.body.velocity.angle());
    });
  }

  pedArrived(ped, now) {
    ped.body.setVelocity(0, 0);

    if (ped.goal === 'fetch') {
      const cart = ped.fetching;
      // Somebody else got to it first, or an attendant picked it up.
      if (!cart || cart.state !== 'idle') {
        this.retarget(ped);
        return;
      }
      cart.state = 'ped';
      cart.owner = null;
      cart.claimedBy = null;
      cart.sprite.setDepth(5);
      ped.cart = cart;
      ped.fetching = null;
      ped.goal = 'tidy';
      ped.dropAt = this.corralSlot(cart.sprite.x, cart.sprite.y);
      this.routeTo(ped, ped.dropAt);
      return;
    }

    if (ped.goal === 'tidy') {
      this.parkCart(ped);
      return;
    }

    if (ped.goal === 'leave') {
      // Through the door and gone. The fade runs outside the pedestrian loop,
      // so nothing is removed from the group mid-iteration.
      ped.leaving = true;
      ped.body.setVelocity(0, 0);
      this.tweens.add({
        targets: ped,
        alpha: 0,
        duration: 260,
        onComplete: () => ped.destroy(),
      });
      return;
    }

    ped.pauseUntil = now + Phaser.Math.Between(300, 1500);
    this.retarget(ped);
  }

  // The cart rides in front of the shopper, the way one actually gets pushed.
  carryCart(ped) {
    const a = ped.rotation;
    const d = CFG.peds.cartOffset;
    ped.cart.sprite
      .setPosition(
        Phaser.Math.Clamp(ped.x + Math.cos(a) * d, CFG.lot.x1 + 10, CFG.lot.x2 - 10),
        Phaser.Math.Clamp(ped.y + Math.sin(a) * d, CFG.sidewalk.y + 10, CFG.lot.y2 - 10)
      )
      .setRotation(a);
  }

  // Cart goes back in the rack, and that bay becomes its new home — so an
  // attendant who later loses it has it sent back to where it now lives.
  parkCart(ped) {
    const cart = ped.cart;
    ped.cart = null;
    if (cart) {
      cart.state = 'idle';
      cart.owner = null;
      cart.claimedBy = null;
      cart.home = { ...ped.dropAt };
      cart.sprite.setDepth(4).setRotation(0).setPosition(cart.home.x, cart.home.y);
    }
    ped.dropAt = null;
    this.retarget(ped);
  }

  // Walked into a parked car or a planter. Sidestep around it rather than
  // abandoning the trip, and only give up after a few failed attempts.
  unstick(ped) {
    if (ped.leaving) return;
    if (!ped.route || ped.route.length === 0) {
      this.retarget(ped);
      return;
    }
    // The collider fires every frame contact lasts, so only count a fresh
    // shove — otherwise a single parked car burns the whole allowance at once.
    if (this.frame - (ped.stuckAt || -99) < CFG.peds.stuckCooldown) return;
    ped.stuckAt = this.frame;
    ped.stuck = (ped.stuck || 0) + 1;
    if (ped.stuck > CFG.peds.stuckLimit) {
      this.dropPedCart(ped);
      this.retarget(ped);
      return;
    }
    const a = ped.rotation + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    ped.route.unshift({
      x: Phaser.Math.Clamp(ped.x + Math.cos(a) * 70, CFG.lot.x1 + 20, CFG.lot.x2 - 20),
      y: Phaser.Math.Clamp(
        ped.y + Math.sin(a) * 70,
        CFG.sidewalk.y + 20,
        CFG.lot.y2 - 20
      ),
    });
  }

  // Cart left where it stands — an attendant can still come and get it.
  dropPedCart(ped) {
    if (!ped.cart) return;
    ped.cart.state = 'idle';
    ped.cart.claimedBy = null;
    ped.cart.sprite.setDepth(4);
    ped.cart = null;
    ped.dropAt = null;
  }

  // ---------- players + cart trains ----------

  createPlayers() {
    const cursors = this.input.keyboard.createCursorKeys();
    const wasd = this.input.keyboard.addKeys('W,A,S,D,E');
    const enter = this.input.keyboard.addKey('ENTER');
    // `use` is the get-on/get-off key for the forklift, and it belongs to
    // the key set rather than the player: solo answers to both sets, so
    // either key works, while co-op hands each player the one that falls
    // under the hand already steering.
    const arrowSet = {
      up: cursors.up,
      down: cursors.down,
      left: cursors.left,
      right: cursors.right,
      use: enter,
    };
    const wasdSet = { up: wasd.W, down: wasd.S, left: wasd.A, right: wasd.D, use: wasd.E };

    // Touch devices get a stick per player: bottom left is always player one,
    // bottom right the second player, which lines up with the split screen.
    TouchControls.setLayout(
      this.playerCount,
      this.mode === 'versus' ? ['ATTENDANT', 'RIDER'] : ['P1', 'P2']
    );
    const stick = (i) => [TouchControls.stick(i)];

    this.players = [];
    if (this.mode === 'solo') {
      // Solo answers to both key sets.
      this.players.push(new LotPlayer(this, 0, [arrowSet, wasdSet], { sticks: stick(0) }));
    } else {
      this.players.push(new LotPlayer(this, 0, [arrowSet], { sticks: stick(0) }));
      this.players.push(
        this.mode === 'versus'
          ? new MopedPlayer(this, 1, wasdSet, stick(1))
          : new LotPlayer(this, 1, [wasdSet], { sticks: stick(1) })
      );
    }

    this.players.forEach((p) => this.physics.add.collider(p.sprite, this.scenery));
    this.driver = this.players.find((p) => p.kind === 'driver') || null;
  }

  bindInput() {
    const restart = () => this.scene.restart();
    const menu = () => {
      this.scene.stop('Hud');
      this.scene.start('Menu');
    };
    this.input.keyboard.on('keydown-R', restart);
    this.input.keyboard.on('keydown-M', menu);
    // Same on-screen, for the devices the sticks are there for.
    TouchControls.setActions({ restart, menu, use: () => this.touchUse() });
    // A scene swap mid-push would otherwise leave a stick stuck over.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => TouchControls.reset());
  }

  // Only attendants hold lives and clear the lot; the driver just racks up hits.
  activeAttendants() {
    return this.players.filter((p) => p.alive && p.canPushCarts);
  }

  // ---------- lot / interior zones ----------

  // Is x within either door's gap on the south wall? The lot side and the
  // interior side share the same x/w, so the two funnels line up.
  inDoorX(x) {
    return CFG.doors.some((d) => Math.abs(x - d.x) < d.w / 2);
  }

  // Keeps a player clamped to whichever floor they're currently on, and
  // hands them through a door when they walk into one. There's no single
  // rectangle covering both the lot and the store interior, so — unlike
  // everything else in the lot — players don't use Arcade's world-bounds
  // collision at all; this manual clamp replaces it every frame.
  constrainToZone(p) {
    const margin = CFG.interior.triggerMargin;

    if (p.zone === 'interior') {
      const f = CFG.interior.floor;
      if (p.canPushCarts && p.y > f.y2 - margin && this.inDoorX(p.x)) {
        this.exitStore(p);
        return;
      }
      // The interior has a real perimeter wall on three sides now, so the
      // clamp stops at its inner face. The south side is the storefront,
      // which is where the doors are, so it keeps the bare floor edge.
      const t = CFG.interior.wallT;
      p.sprite.x = Phaser.Math.Clamp(p.x, f.x1 + t + 10, f.x2 - t - 10);
      p.sprite.y = Phaser.Math.Clamp(p.y, f.y1 + t + 10, f.y2 - 10);
    } else {
      if (p.canPushCarts && p.y <= CFG.sidewalk.y + margin && this.inDoorX(p.x)) {
        this.enterStore(p);
        return;
      }
      p.sprite.x = Phaser.Math.Clamp(p.x, CFG.lot.x1 + 8, CFG.lot.x2 - 8);
      p.sprite.y = Phaser.Math.Clamp(p.y, CFG.sidewalk.y, CFG.lot.y2 - 8);
    }
  }

  enterStore(p) {
    p.zone = 'interior';
    const d = CFG.doors.find((door) => Math.abs(p.x - door.x) < door.w / 2);
    p.sprite.setPosition(d ? d.x : p.x, CFG.interior.floor.y2 - 20);
    p.marker.setPosition(p.x, p.y);
    p.trail.length = 0;
    p.inBreakRoom = false;
    this.syncRoofVisibility();
    this.publish();
  }

  exitStore(p) {
    p.zone = 'lot';
    const d = CFG.doors.find((door) => Math.abs(p.x - door.x) < door.w / 2);
    p.sprite.setPosition(d ? d.x : p.x, CFG.sidewalk.y + 20);
    p.marker.setPosition(p.x, p.y);
    p.trail.length = 0;
    this.syncRoofVisibility();
    this.publish();
  }

  // Recomputes, per camera, whether the store roof is drawn: hidden for any
  // camera whose player is inside, shown for the rest. The minimap camera is
  // never touched here, so the building always reads as a plain block on it.
  syncRoofVisibility() {
    if (!this.storeRoof) return;
    // `cameraFilter` is the bitmask Camera.ignore() sets bits on; clearing it
    // back to 0 is the only way to undo an ignore (Phaser has no built-in
    // "un-ignore"), then each interior camera sets its own bit again.
    this.storeRoof.forEach((o) => {
      o.cameraFilter = 0;
    });
    this.views.forEach((cam, i) => {
      const p = this.players[i];
      if (p && p.zone === 'interior') cam.ignore(this.storeRoof);
    });
  }

  // Edge-triggered — fires only the frame a player arrives in the break
  // room, not every frame they stand in it.
  updateBreakRoom(p, now) {
    const b = CFG.interior.breakRoom;
    const inside =
      p.zone === 'interior' && p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;

    if (inside && !p.inBreakRoom) {
      if (p.lives < CFG.lives && now >= p.nextRechargeAt) {
        p.lives += 1;
        p.nextRechargeAt = now + CFG.interior.rechargeCooldownMs;
        this.banner(p.x, p.y, 'RECHARGED', '#7fd6a6');
        this.publish();
      } else if (p.lives >= CFG.lives) {
        this.banner(p.x, p.y, 'BREAK ROOM', '#8a97a6');
      } else {
        const left = Math.ceil((p.nextRechargeAt - now) / 1000);
        this.banner(p.x, p.y, `ON BREAK ${left}s`, '#8a97a6');
      }
    }
    p.inBreakRoom = inside;
  }

  // ---------- interior shoppers (cosmetic) ----------

  anyoneInside() {
    return this.players.some((p) => p.zone === 'interior');
  }

  updateInteriorPeds(now) {
    const inside = this.anyoneInside();
    if (inside && this.interiorPeds.length === 0) this.buildInteriorPeds();
    if (!inside && this.interiorPeds.length > 0) this.clearInteriorPeds();
    if (inside) this.interiorPeds.forEach((sp) => sp.update(now));
  }

  buildInteriorPeds() {
    const n = 7;
    for (let i = 0; i < n; i++) this.interiorPeds.push(new StorePed(this));
  }

  clearInteriorPeds() {
    this.interiorPeds.forEach((sp) => sp.destroy());
    this.interiorPeds = [];
  }

  tryPickup(p, now) {
    if (p.train.length >= p.maxTrain(now)) return;
    const reach = p.pickupRadius();
    const cart = this.carts.find(
      (c) =>
        c.state === 'idle' &&
        Phaser.Math.Distance.Between(c.sprite.x, c.sprite.y, p.x, p.y) < reach
    );
    if (!cart) return;

    cart.state = 'train';
    cart.owner = p;
    cart.sprite.setDepth(5);
    p.train.push(cart);
    const t = p.cartTarget(p.train.length - 1); // snap in, no slide across the lot
    cart.sprite.setPosition(t.x, t.y).setRotation(p.facing.angle());
    this.publish();
  }

  tryDeliver(p) {
    if (p.train.length === 0) return;
    const dz = CFG.interior.vestibule.dropZone;
    if (Math.abs(p.x - dz.x) > dz.w / 2 + 10 || Math.abs(p.y - dz.y) > dz.h / 2 + 16) {
      return;
    }

    const n = p.train.length;
    p.train.forEach((cart) => {
      cart.state = 'done';
      cart.owner = null;
      cart.sprite.destroy();
      this.cartsDelivered += 1;
    });
    // Handed over and gone — dropped from the list so the store's cap on live
    // carts counts what is actually out on the lot.
    this.carts = this.carts.filter((c) => c.state !== 'done');
    p.train = [];

    const gained = n * CFG.score.perCart + (n - 1) * CFG.score.chainBonus;
    p.score += gained;
    this.banner(p.x, p.y, `+${gained}`, '#7fd6a6');
    this.publish();

    if (this.cartsDelivered >= this.cartsTotal) this.nextLevel();
  }

  // Carts scatter where they stood and can be picked back up by either player.
  dropTrain(p) {
    p.train.forEach((cart) => {
      cart.state = 'idle';
      cart.owner = null;
      cart.sprite.setDepth(4);
      cart.sprite.x = Phaser.Math.Clamp(
        cart.sprite.x + Phaser.Math.Between(-20, 20),
        CFG.lot.x1 + 20,
        CFG.lot.x2 - 20
      );
      cart.sprite.y = Phaser.Math.Clamp(
        cart.sprite.y + Phaser.Math.Between(-20, 20),
        CFG.sidewalk.y + 16,
        CFG.lot.y2 - 20
      );
    });
    p.train = [];
  }

  returnTrainHome(p) {
    p.train.forEach((cart) => {
      cart.state = 'idle';
      cart.owner = null;
      cart.sprite.setDepth(4).setRotation(0).setPosition(cart.home.x, cart.home.y);
    });
    p.train = [];
  }

  // ---------- obstacles ----------

  // The lot's moving hazards. Every kind in CFG.obstacles.kinds gets a class
  // registered in src/obstacle.js and a headcount that grows with the level, so
  // a second kind is a config row and a class and nothing in here changes.
  buildObstacles() {
    this.obstacles = [];
    CFG.obstacles.kinds.forEach((def) => {
      // Kinds the heat meter owns are not on the rota: updateHeat() puts
      // them out and takes them back in, so the shift starts without them.
      if (def.spawnedBy) return;
      const n = Math.min(def.max, def.count + (this.level - 1) * def.perLevel);
      for (let i = 0; i < n; i++) this.spawnObstacle(def.key);
    });
  }

  // Out in the rows or on a walkway, but never close enough to an attendant to
  // be on top of them before they have seen it.
  obstacleSpot() {
    for (let i = 0; i < 24; i++) {
      const p = Math.random() < 0.5 ? this.randomLotPoint() : this.randomWalkPoint();
      if (this.inIsland(p.x, p.y) || this.inCorral(p.x, p.y)) continue;
      const near = this.activeAttendants().some(
        (a) => Phaser.Math.Distance.Between(a.x, a.y, p.x, p.y) < CFG.obstacles.minPlayerDist
      );
      if (near) continue;
      return p;
    }
    return null;
  }

  // `at` places one somewhere specific — the storefront doors, for a guard
  // the front office has just sent out.
  spawnObstacle(key, at) {
    const spot = at || this.obstacleSpot();
    if (!spot) return null;
    const ob = Obstacle.create(this, key, spot.x, spot.y);
    if (ob) this.obstacles.push(ob);
    return ob;
  }

  updateObstacles(now) {
    this.obstacles.forEach((ob) => ob.update(now));
  }

  clearObstacles() {
    this.obstacles.forEach((ob) => ob.destroy());
    this.obstacles = [];
  }

  // Did anything living catch this attendant? A shield bounces a coworker off
  // without breaking — it takes a motor to burn one of those.
  resolveObstacles(p, now) {
    // Anything that doesn't stand in front of a forklift has already been
    // run over by forkliftHazards() by the time this runs.
    const ob = this.obstacles.find(
      (o) => o.catches(p) && (!p.forklift || o.stopsVehicles())
    );
    if (!ob) return false;

    if (p.hasEffect('shield', now)) {
      ob.recoil(p.x, p.y, ob.def.knockback, ob.def.gloatMs);
      this.banner(p.x, p.y, 'BOUNCED', Powerup.def('shield').text);
      return true;
    }
    // The kind decides what it costs: a coworker shoves, security arrests.
    ob.punish(p, now);
    ob.landedHit(now);
    return true;
  }

  // Walked into by an angry coworker. No life lost — they are a nuisance, not
  // traffic — but the train goes everywhere and you spend a moment picking
  // yourself up, which out in a live aisle is its own problem.
  shovedBy(p, ob, now) {
    const dropped = p.train.length;
    p.stunUntil = now + ob.def.stunMs;
    p.invulnUntil = now + ob.def.stunMs + ob.def.graceMs;
    p.sprite.body.setVelocity(0, 0);
    this.dropTrain(p);
    this.flash(ob.def.color);
    this.banner(p.x, p.y, dropped > 1 ? `${dropped} CARTS LOOSE` : 'WATCH IT', ob.def.text);
    this.publish();
  }

  // ---------- power-ups ----------

  buildPowerups() {
    this.powerups = [];
    this.nextPowerAt = this.time.now + CFG.powerups.firstDelay * 1000;
  }

  // Somewhere worth walking to. Mostly out in the drive aisles, where picking
  // one up means stepping into live traffic; the rest on the walkways, which
  // are safe but a long way from wherever the carts are.
  powerupSpot() {
    for (let i = 0; i < 24; i++) {
      const p =
        Math.random() < CFG.powerups.aisleChance
          ? this.randomLotPoint()
          : this.randomWalkPoint();
      if (this.inIsland(p.x, p.y) || this.inCorral(p.x, p.y)) continue;
      // Not right in the doorway, on top of another badge, or anyone's feet.
      const dz = CFG.dropZone;
      if (Math.abs(p.x - dz.x) < 240 && Math.abs(p.y - dz.y) < 130) continue;
      if (this.powerups.some((q) => Phaser.Math.Distance.Between(q.x, q.y, p.x, p.y) < 260)) {
        continue;
      }
      const near = this.activeAttendants().some(
        (a) => Phaser.Math.Distance.Between(a.x, a.y, p.x, p.y) < CFG.powerups.minPlayerDist
      );
      if (near) continue;
      return p;
    }
    return null;
  }

  updatePowerups(now) {
    this.powerups = this.powerups.filter((pu) => {
      if (pu.update(now)) return true;
      pu.destroy();
      return false;
    });

    // The timer rolls on even when the lot is full of badges, so clearing one
    // doesn't instantly conjure the next.
    if (now >= this.nextPowerAt) {
      if (this.powerups.length < CFG.powerups.maxActive) {
        const spot = this.powerupSpot();
        if (spot) this.powerups.push(new Powerup(this, Powerup.rollKind(), spot.x, spot.y, now));
      }
      const [lo, hi] = CFG.powerups.interval;
      this.nextPowerAt = now + Phaser.Math.Between(lo, hi) * 1000;
    }

    // Only attendants collect: the versus rider rides straight over them.
    this.activeAttendants().forEach((p) => {
      const pu = this.powerups.find(
        (q) => Phaser.Math.Distance.Between(q.x, q.y, p.x, p.y) < CFG.powerups.pickupRadius
      );
      if (pu) this.collectPowerup(p, pu, now);
    });
  }

  collectPowerup(p, pu, now) {
    p.grant(pu.key, now);
    p.score += CFG.score.powerup;
    this.banner(p.x, p.y, pu.def.label, pu.def.text);
    this.powerups = this.powerups.filter((q) => q !== pu);
    pu.destroy();
    this.publish();
  }

  // ---------- the stolen forklift ----------

  // The forklift itself lives in src/forklift.js; everything the scene has
  // to say about it is here. It is one machine, shared: in co-op whoever
  // gets to it first has it, and in versus it is the attendant's answer to
  // a moped that has been running them down all shift.

  buildForklift() {
    this.forklift = new Forklift(this, CFG.forklift.spawn);
  }

  // Which storefront door is nearest a given x. Security posts on one when
  // the driver they want has gone inside, where they have no body to follow.
  nearestDoor(x) {
    return CFG.doors.reduce((best, d) => (Math.abs(d.x - x) < Math.abs(best.x - x) ? d : best));
  }

  // The use key: get on if you are standing next to it, get off if you are
  // on it. Nothing here ever forces somebody off — being hauled off is
  // security's job, not a keypress.
  useForklift(p, now) {
    const f = this.forklift;
    if (!p.alive || !p.canPushCarts || now < p.stunUntil) return;

    if (p.forklift) {
      f.dismount();
      this.banner(p.x, p.y, 'STEPPED OFF', '#8a97a6');
      this.publish();
      return;
    }
    if (!f.reachableBy(p)) return;

    f.mount(p);
    // The first one off the dock is the theft. Getting back on afterwards
    // is just getting back on — the heat it earned is already yours.
    if (!f.stolen) {
      f.stolen = true;
      p.score += CFG.score.forkliftTheft;
      this.addHeat(p, CFG.forklift.heat.theft, now);
      this.banner(p.x, p.y, `+${CFG.score.forkliftTheft} FORKLIFT`, '#f2c85c');
    } else {
      this.banner(p.x, p.y, 'FORKLIFT', '#f2c85c');
    }
    this.publish();
  }

  // Touch has one use button rather than a key per player, so it goes to
  // whoever it could plausibly mean: the rider first, then anybody standing
  // close enough to climb on.
  touchUse() {
    const p =
      this.players.find((a) => a.forklift) ||
      this.players.find((a) => this.forklift.reachableBy(a));
    if (p) this.useForklift(p, this.time.now);
  }

  // Everything three tonnes of steel touches while somebody is driving it.
  // Bodies go on the floor and the meter goes up; carts are left alone,
  // because sweeping those up is what the thing is for.
  forkliftHazards(p, now) {
    if (now < p.stunUntil) return;
    const r = CFG.forklift.hitRadius;

    // Inside, the only people in the way are the cosmetic shoppers — and
    // running one down in front of the registers is worth the same as
    // doing it out on the asphalt, and reported just as fast.
    if (p.zone === 'interior') {
      this.interiorPeds.forEach((sp) => {
        if (now < sp.downUntil || Phaser.Math.Distance.Between(sp.x, sp.y, p.x, p.y) > r) {
          return;
        }
        sp.flatten(p.x, p.y, now);
        this.ranDown(p, 'SHOPPER', now);
      });
      return;
    }

    let hitPed = null;
    this.peds.children.iterate((ped) => {
      if (!ped || ped.leaving || hitPed) return;
      if (now < (ped.downUntil || 0)) return;
      if (Phaser.Math.Distance.Between(ped.x, ped.y, p.x, p.y) < r) hitPed = ped;
    });
    if (hitPed) {
      this.flattenPed(hitPed, p, now);
      this.ranDown(p, 'SHOPPER', now);
    }

    // Staff on the lot. Security is the exception: they are the one thing
    // out here that stands in front of it, so resolveObstacles() gets them.
    const ob = this.obstacles.find(
      (o) =>
        !o.stopsVehicles() &&
        now >= o.stunUntil &&
        Phaser.Math.Distance.Between(o.x, o.y, p.x, p.y) < r
    );
    if (ob) {
      ob.recoil(p.x, p.y, ob.def.knockback * 2, CFG.forklift.downMs);
      this.ranDown(p, ob.def.label, now);
    }

    // And whoever else is out here with you. In versus that is the moped
    // that has spent the shift running you down, and it spills like it
    // spills off anything else; in co-op it is the partner you are racing,
    // and it costs them exactly what a car would.
    this.players.forEach((o) => {
      if (o === p || !o.alive || o.zone !== 'lot') return;
      if (now < o.invulnUntil) return;
      if (o.canPushCarts && o.spawnSafe) return; // nobody is farmed at a respawn
      if (Phaser.Math.Distance.Between(o.x, o.y, p.x, p.y) > r) return;
      if (this.absorbHit(o, now)) return;

      this.ranDown(p, o.label, now);
      if (o.canPushCarts) this.runOver(o, now);
      else o.spinOut(now, CFG.moped.stunOnCrash);
    });
  }

  // A shopper the forks caught: cart gone, thrown clear, and down long
  // enough that you feel it. They pick a fresh errand when they get up.
  flattenPed(ped, by, now) {
    this.dropPedCart(ped);
    this.shove(ped, by);
    ped.body.setVelocity(0, 0);
    ped.route = null;
    ped.downUntil = now + CFG.forklift.downMs;
    ped.pauseUntil = ped.downUntil;
    this.tweens.add({
      targets: ped,
      alpha: 0.35,
      yoyo: true,
      duration: CFG.forklift.downMs / 2,
    });
  }

  // One body, whoever it belonged to: points now, and a meter that somebody
  // in the front office is watching.
  ranDown(p, label, now) {
    p.score += CFG.score.flatten;
    this.addHeat(p, CFG.forklift.heat.perPerson, now);
    this.banner(p.x, p.y, `+${CFG.score.flatten} ${label}`, '#f2c85c');
    this.publish();
  }

  // Clipped by live traffic. The car loses that one: the forklift stalls and
  // the driver is thrown about for a moment, but the train stays on the
  // forks and nobody loses a life — which is most of why it is worth taking.
  forkliftCrash(p, now) {
    p.stunUntil = now + CFG.forklift.stallMs;
    p.invulnUntil = now + CFG.forklift.stallMs + CFG.moped.crashImmuneMs;
    p.forklift.stall();
    this.addHeat(p, CFG.forklift.heat.perCrash, now);
    this.flash(0xd9a441);
    this.banner(p.x, p.y, 'STALLED', '#e6c06a');
    this.publish();
  }

  // ---------- heat ----------

  addHeat(p, points, now) {
    const h = CFG.forklift.heat;
    p.heat = Phaser.Math.Clamp(p.heat + points, 0, h.max);
    p.calmAt = now + h.calmMs;
  }

  // The meter rounded up into stars, which is all the HUD and the guard
  // count ever read off it.
  stars(p) {
    const h = CFG.forklift.heat;
    return Math.min(h.stars, Math.ceil(p.heat / (h.max / h.stars)));
  }

  coolOff(p) {
    p.heat = 0;
    p.calmAt = 0;
  }

  // The meter sheds once you have been quiet for a moment, and the detail on
  // the lot is topped up and stood back down to match the worst star rating
  // anybody is currently carrying. Dumping the forklift and behaving is a
  // real escape: give it long enough and they walk back inside.
  updateHeat(now, dt) {
    const h = CFG.forklift.heat;
    let worst = 0;
    this.players.forEach((p) => {
      if (now > p.calmAt) p.heat = Math.max(0, p.heat - h.decay * dt);
      worst = Math.max(worst, this.stars(p));
    });

    const def = Obstacle.def('security');
    const want = Phaser.Math.Clamp(worst - h.guardsFromStar, 0, def.max);
    const detail = this.obstacles.filter((o) => o.key === 'security');

    // They come out of the storefront doors, which is where they would.
    for (let i = detail.length; i < want; i++) {
      this.spawnObstacle('security', this.doorPoint(i % CFG.doors.length));
    }

    const surplus = detail.slice(want);
    if (surplus.length) {
      if (want === 0) this.banner(surplus[0].x, surplus[0].y, 'HEAT OFF', '#8fc4ec');
      surplus.forEach((o) => o.destroy());
      this.obstacles = this.obstacles.filter((o) => !surplus.includes(o));
    }
  }

  // Security got a hand on them. Off the forklift, train on the floor, a
  // fine off the score, and the meter clears — which stands the rest of the
  // detail down and leaves the forklift sitting wherever it stopped for
  // whoever fancies another go.
  busted(p, ob, now) {
    p.score -= CFG.score.busted;
    p.stunUntil = now + CFG.forklift.bustedStunMs;
    p.invulnUntil = now + CFG.forklift.bustedStunMs + ob.def.graceMs;
    p.sprite.body.setVelocity(0, 0);
    if (p.forklift) p.forklift.dismount();
    this.dropTrain(p);
    this.coolOff(p);
    this.flash(ob.def.color);
    this.banner(p.x, p.y, `BUSTED -${CFG.score.busted}`, ob.def.text);
    this.publish();
  }

  // ---------- hazards ----------

  // A shield eats one hit from anything with a motor and breaks. The train and
  // the life both survive, and a moment of grace follows so the same car
  // cannot clip you again before you are out of its way.
  absorbHit(p, now) {
    if (!p.hasEffect('shield', now)) return false;
    p.clearEffect('shield');
    p.stunUntil = now + CFG.powerups.shieldStunMs;
    p.invulnUntil = now + CFG.powerups.shieldGraceMs;
    p.sprite.body.setVelocity(0, 0);
    this.flash(Powerup.def('shield').color);
    this.banner(p.x, p.y, 'SHIELD HELD', Powerup.def('shield').text);
    this.publish();
    return true;
  }

  shrink(rect, dx, dy) {
    return new Phaser.Geom.Rectangle(
      rect.x + dx,
      rect.y + dy,
      rect.width - dx * 2,
      rect.height - dy * 2
    );
  }

  hitByTraffic(p) {
    const pb = p.sprite.getBounds();
    return this.lanes.some((lane) =>
      lane.sprites.some((s) =>
        Phaser.Geom.Intersects.RectangleToRectangle(pb, this.shrink(s.getBounds(), 6, 6))
      )
    );
  }

  hitByPed(p) {
    let hit = false;
    this.peds.children.iterate((ped) => {
      if (!ped || hit) return;
      if (Phaser.Math.Distance.Between(ped.x, ped.y, p.x, p.y) < 22) hit = true;
    });
    return hit;
  }

  bumpedByPed(p, now) {
    p.stunUntil = now + CFG.player.stunMs;
    p.invulnUntil = now + CFG.player.stunMs + 250;
    p.sprite.body.setVelocity(0, 0);
    this.dropTrain(p);
    this.flash(0xd9a441);
    this.banner(p.x, p.y, 'EXCUSE ME', '#e6c06a');
    this.publish();
  }

  runOver(p, now) {
    p.lives -= 1;
    this.returnTrainHome(p);
    this.flash(0xc94f4f);
    this.banner(p.x, p.y, 'FLATTENED', '#e08b8b');
    p.respawn(now, 1600);
    if (p.lives <= 0) p.eliminate();
    this.publish();
    if (this.activeAttendants().length === 0) this.endGame('wiped');
  }

  outOfTime(now) {
    this.timeLeft = CFG.levelSeconds;
    this.activeAttendants().forEach((p) => {
      p.lives -= 1;
      this.returnTrainHome(p);
      this.banner(p.x, p.y, 'CLOSING TIME', '#e08b8b');
      p.respawn(now, 1200);
      if (p.lives <= 0) p.eliminate();
    });
    this.flash(0xc94f4f);
    this.publish();
    if (this.activeAttendants().length === 0) this.endGame('wiped');
  }

  // ---------- the driver (versus mode) ----------

  // The moped is a hazard with a person on it: it flattens attendants for
  // points, and pays for hitting anything else in the lot.
  driverHazards(car, now) {
    if (now < car.stunUntil || now < car.invulnUntil) return;

    if (this.hitByTraffic(car)) {
      car.score -= CFG.score.crashPenalty;
      car.spinOut(now, CFG.moped.stunOnCrash);
      car.invulnUntil = now + CFG.moped.stunOnCrash + CFG.moped.crashImmuneMs;
      this.flash(0xc94f4f);
      this.banner(car.x, car.y, `-${CFG.score.crashPenalty} CRASH`, '#e08b8b');
      this.publish();
      return;
    }

    let hitPed = null;
    this.peds.children.iterate((ped) => {
      if (!ped || hitPed) return;
      if (Phaser.Math.Distance.Between(ped.x, ped.y, car.x, car.y) < CFG.moped.hitRadius) {
        hitPed = ped;
      }
    });
    if (hitPed) {
      car.score -= CFG.score.pedPenalty;
      car.spinOut(now, CFG.moped.stunOnPed);
      car.invulnUntil = now + CFG.moped.stunOnPed + CFG.moped.crashImmuneMs;
      this.shove(hitPed, car);
      this.retarget(hitPed);
      this.banner(car.x, car.y, `-${CFG.score.pedPenalty} SHOPPER`, '#e6c06a');
      this.publish();
      return;
    }

    // Staff are people too: flattening one pays the same as a shopper, and
    // leaves them sitting on the asphalt for a moment.
    const hitOb = this.obstacles.find(
      (ob) => Phaser.Math.Distance.Between(ob.x, ob.y, car.x, car.y) < CFG.moped.hitRadius
    );
    if (hitOb) {
      car.score -= CFG.score.pedPenalty;
      car.spinOut(now, CFG.moped.stunOnPed);
      car.invulnUntil = now + CFG.moped.stunOnPed + CFG.moped.crashImmuneMs;
      hitOb.recoil(car.x, car.y, hitOb.def.knockback, hitOb.def.gloatMs);
      this.banner(car.x, car.y, `-${CFG.score.pedPenalty} ${hitOb.def.label}`, '#e6c06a');
      this.publish();
    }
  }

  // Clipping carts scatters them: loose ones get shunted, and a cart being
  // pushed is knocked out of its train.
  scatterCarts(car) {
    this.carts.forEach((cart) => {
      if (cart.state === 'done') return;
      if (Phaser.Math.Distance.Between(cart.sprite.x, cart.sprite.y, car.x, car.y) > 30) {
        return;
      }
      if (cart.state === 'train' && cart.owner) {
        cart.owner.train = cart.owner.train.filter((c) => c !== cart);
        cart.owner = null;
        cart.state = 'idle';
        cart.sprite.setDepth(4);
        this.publish();
      } else if (cart.state === 'ped') {
        this.peds.children.iterate((ped) => {
          if (ped && ped.cart === cart) this.dropPedCart(ped);
        });
      }
      this.shove(cart.sprite, car);
    });
  }

  shove(target, car) {
    const angle = Phaser.Math.Angle.Between(car.x, car.y, target.x, target.y);
    const push = 26;
    target.x = Phaser.Math.Clamp(
      target.x + Math.cos(angle) * push,
      CFG.lot.x1 + 20,
      CFG.lot.x2 - 20
    );
    target.y = Phaser.Math.Clamp(
      target.y + Math.sin(angle) * push,
      CFG.sidewalk.y + 16,
      CFG.lot.y2 - 20
    );
  }

  rundown(car, p, now) {
    car.score += CFG.score.takedown;
    car.takedowns += 1;
    car.spinOut(now, CFG.moped.stunOnHit);
    this.banner(car.x, car.y, `+${CFG.score.takedown}`, '#ef8fae');
    this.runOver(p, now);
  }

  // ---------- flow ----------

  nextLevel() {
    if (this.mode === 'versus') {
      this.endGame('cleared');
      return;
    }

    this.level += 1;
    this.speedMul = 1 + (this.level - 1) * CFG.levelSpeedStep;
    const bonus = CFG.score.levelClear + Math.round(this.timeLeft) * CFG.score.timeBonus;
    this.activeAttendants().forEach((p) => {
      p.score += bonus;
      p.train = [];
    });
    this.timeLeft = CFG.levelSeconds;

    this.peds.children.iterate((ped) => {
      if (!ped) return;
      ped.cart = null;
      ped.fetching = null;
      ped.dropAt = null;
      ped.route = null;
    });
    this.carts.forEach((c) => c.sprite && c.sprite.destroy());
    this.carts = [];
    this.spawnCarts();
    this.pedTarget += 1;
    this.spawnPed();
    this.buildRestock();

    // A fresh crew for the new lot, one head bigger than the last, and
    // whatever you did on the last one is somebody else's paperwork now:
    // the meter is wiped and the forklift is back on the dock.
    this.clearObstacles();
    this.buildObstacles();
    this.players.forEach((pl) => this.coolOff(pl));
    this.forklift.reset();

    // Badges and effects do not carry across lots.
    this.powerups.forEach((pu) => pu.destroy());
    this.buildPowerups();
    this.players.forEach((pl) => pl.clearEffects());

    const lead = this.players[0];
    this.banner(lead.x, lead.y, `LOT ${this.level}`, '#8fc4ec');
    this.publish();
  }

  // The end card belongs to the HUD scene: that camera is unzoomed and covers
  // the whole canvas, so it reads the same in solo and in split screen.
  endGame(outcome) {
    this.gameOver = true;

    const attendant = this.players[0];
    let headline = 'SHIFT OVER';
    let verdict = '';

    if (this.mode === 'versus') {
      headline = outcome === 'cleared' ? 'LOT CLEARED' : 'ATTENDANT DOWN';
      verdict =
        outcome === 'cleared'
          ? `${attendant.label} wins — every cart returned`
          : `${this.driver.label} wins — ${this.driver.takedowns} takedown${
              this.driver.takedowns === 1 ? '' : 's'
            }`;
    } else if (this.players.length > 1) {
      const best = this.players.reduce((a, b) => (b.score > a.score ? b : a));
      const tie = this.players.every((p) => p.score === best.score);
      verdict = tie ? 'dead heat' : `${best.label} wins the shift`;
    }

    this.registry.set('gameover', {
      headline,
      verdict,
      scores:
        this.players.length === 1
          ? `score ${this.players[0].score}`
          : this.players.map((p) => `${p.label} ${p.score}`).join('   ·   '),
    });
  }

  // Full-screen tints are a camera effect now: a world-sized rectangle would
  // have to be sized and placed per camera.
  flash(color) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    this.views.forEach((cam) => cam.flash(280, r, g, b, true));
  }

  banner(x, y, text, color) {
    const label = this.add
      .text(x, y - 26, text, { fontFamily: 'monospace', fontSize: '18px', color })
      .setOrigin(0.5)
      .setDepth(16);
    this.tweens.add({
      targets: label,
      y: label.y - 28,
      alpha: 0,
      duration: 800,
      onComplete: () => label.destroy(),
    });
  }

  publish() {
    const now = this.time.now;
    this.registry.set('hud', {
      level: this.level,
      left: this.cartsTotal - this.cartsDelivered,
      quota: this.cartsTotal,
      time: Math.max(0, this.timeLeft),
      maxTrain: CFG.cart.maxTrain,
      maxStars: CFG.forklift.heat.stars,
      mode: this.mode,
      players: this.players.map((p) => ({
        label: p.label,
        kind: p.kind,
        score: p.score,
        lives: p.lives === null ? null : Math.max(0, p.lives),
        train: p.train.length,
        maxTrain: p.maxTrain(now),
        effects: p.activeEffects(now).map((e) => ({ label: e.label, left: e.left })),
        takedowns: p.takedowns || 0,
        alive: p.alive,
        zone: p.zone,
        driving: !!p.forklift,
        stars: this.stars(p),
      })),
    });
  }

  // ---------- loop ----------

  update(time, delta) {
    const dt = delta / 1000;
    this.frame += 1;
    this.updateLights(time / 1000);
    this.lanes.forEach((lane) => this.updateLane(lane, dt));
    this.drawBlips();
    if (this.gameOver) return;

    this.updatePeds(time);
    this.updateRestock(time);
    this.updatePowerups(time);
    this.updateObstacles(time);
    this.updateInteriorPeds(time);
    this.updateDoors();
    this.updateHeat(time, dt);

    this.players.forEach((p) => {
      if (p.canPushCarts && p.tappedUse()) this.useForklift(p, time);
      p.handleInput(time, dt);
      p.updateTrain();
      p.updateEffects(time);
      this.constrainToZone(p);
      if (!p.alive || !p.canPushCarts) return;

      if (p.zone === 'lot') this.tryPickup(p, time);
      if (p.zone === 'interior') {
        this.tryDeliver(p);
        this.updateBreakRoom(p, time);
      }

      // Step off the respawn point and the rider can hit you again.
      if (
        p.spawnSafe &&
        Phaser.Math.Distance.Between(p.x, p.y, p.spawn.x, p.spawn.y) >
          CFG.moped.spawnGuard
      ) {
        p.spawnSafe = false;
      }

      const protectedNow = time < p.invulnUntil || (this.driver && p.spawnSafe);
      const blink = protectedNow && Math.floor(time / 90) % 2 ? 0.35 : 1;
      p.sprite.setAlpha(blink);
      p.marker.setAlpha(blink);
    });

    this.forklift.update(time);
    if (this.forklift.rider) this.forkliftHazards(this.forklift.rider, time);

    if (this.driver && this.driver.alive) {
      this.driverHazards(this.driver, time);
      this.scatterCarts(this.driver);
    }

    for (const p of this.players) {
      if (!p.alive || !p.canPushCarts || p.zone !== 'lot' || time < p.invulnUntil) continue;

      if (this.hitByTraffic(p)) {
        // A car versus a forklift is a stall, not a funeral.
        if (p.forklift) this.forkliftCrash(p, time);
        else if (!this.absorbHit(p, time)) this.runOver(p, time);
      } else if (
        this.driver &&
        this.driver.alive &&
        !p.spawnSafe &&
        Phaser.Math.Distance.Between(this.driver.x, this.driver.y, p.x, p.y) <
          CFG.moped.hitRadius
      ) {
        // Bounce the rider off a shield: no takedown, no points, and the same
        // spill they get from hitting anything else.
        if (this.absorbHit(p, time)) {
          this.driver.spinOut(time, CFG.moped.stunOnHit);
        } else {
          this.rundown(this.driver, p, time);
        }
      } else if (this.resolveObstacles(p, time)) {
        // An obstacle caught them; it decides what that costs.
      } else if (this.hitByPed(p) && !p.forklift && !p.hasEffect('shield', time)) {
        // Shoppers just bounce off a shield — it only breaks on a motor —
        // and a shopper in front of a forklift is already on the floor.
        this.bumpedByPed(p, time);
      }
      if (this.gameOver) return;
    }

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.outOfTime(time);
      return;
    }

    this.publish();
  }
}
