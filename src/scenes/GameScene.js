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

    this.buildIslands();
    this.drawLot();
    this.buildObstacles();
    this.buildCorrals();
    this.buildTraffic();
    this.buildPeds();
    this.createPlayers();
    this.buildPowerups();
    this.buildRestock();
    this.setupCameras();
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
    g.fillStyle(c.grass, 1);
    g.fillRect(0, 0, CFG.width, CFG.height);
    g.fillStyle(c.curb, 1);
    const pv = CFG.pavement;
    g.fillRect(pv.x - 6, pv.y - 6, pv.w + 12, pv.h + 12);
    g.fillStyle(c.asphalt, 1);
    g.fillRect(pv.x, pv.y, pv.w, pv.h);

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

      g.fillStyle(c.stallPaint, 0.3);
      if (a.axis === 'x') {
        for (let x = from; x < to; x += 38) g.fillRect(x, a.pos - 1, 20, 2);
      } else {
        for (let y = from; y < to; y += 38) g.fillRect(a.pos - 1, y, 2, 20);
      }
    });

    this.drawCrosswalks(g);
    this.drawIslands(g);
    this.drawJunction(g);
    this.drawStore(g);
    this.drawDropZone();
    this.drawCanopyRoof(); // overhead layer, so it has to come after the rest
  }

  drawStalls(g) {
    CFG.stallRows.forEach((row) => {
      CFG.fields.forEach((field) => {
        const { n, start } = this.fieldSlots(field);
        g.fillStyle(CFG.colors.stallPaint, 0.5);
        g.fillRect(start, row.y + 2, n * CFG.stallW, 2);

        for (let i = 0; i < n; i++) {
          const x = start + i * CFG.stallW;
          const cx = x + CFG.stallW / 2;
          const cy = row.y + CFG.stallH / 2;
          if (this.inIsland(cx, cy)) continue;

          if (this.isAccessible(cx, cy)) {
            g.fillStyle(CFG.colors.accessible, 0.3);
            g.fillRect(x + 4, row.y + 5, CFG.stallW - 8, CFG.stallH - 10);
            g.fillStyle(CFG.colors.accessible, 0.9);
          } else {
            g.fillStyle(CFG.colors.stallPaint, 0.5);
          }
          g.fillRect(x - 1, row.y + 4, 2, CFG.stallH - 8);
          if (i === n - 1) g.fillRect(x + CFG.stallW - 1, row.y + 4, 2, CFG.stallH - 8);
        }
      });
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
    const c = CFG.colors;
    const s = CFG.store;

    this.drawDock(g);
    this.drawAnnex(g);

    // the box itself
    g.fillStyle(c.storeRoof, 1);
    g.fillRect(s.x, s.y, s.w, s.h);
    g.fillStyle(c.store, 1);
    g.fillRect(s.x + 14, s.y + 14, s.w - 28, s.h - 28);

    // roof furniture: skylight grid and HVAC packs, like the real thing
    g.fillStyle(c.skylight, 0.55);
    for (let x = s.x + 90; x < s.x + s.w - 90; x += 168) {
      for (let y = s.y + 90; y < s.y + s.h - 150; y += 150) {
        g.fillRect(x, y, 96, 52);
      }
    }
    g.fillStyle(c.hvac, 1);
    for (let x = s.x + 150; x < s.x + s.w - 150; x += 236) {
      g.fillRect(x, s.y + 60, 74, 48);
      g.fillRect(x + 40, s.y + s.h - 230, 66, 44);
    }

    // parapet along the front, then the storefront face below it
    g.fillStyle(c.storeTrim, 1);
    g.fillRect(s.x, s.y + s.h - 26, s.w, 26);
    g.fillStyle(c.doors, 1);
    CFG.doors.forEach((d) => g.fillRect(d.x - d.w / 2, s.y + s.h - 22, d.w, 18));

    this.drawCanopy(g);

    const signY = s.y + s.h - 76;
    [CFG.doors[0].x + 60, CFG.doors[1].x + 500].forEach((x) => {
      g.fillStyle(c.signBlue, 1);
      g.fillRect(x - 120, signY - 22, 240, 44);
      g.fillStyle(c.signRed, 1);
      g.fillRect(x - 120, signY + 22, 240, 12);
      this.add
        .text(x, signY, 'GROCERY', {
          fontFamily: 'monospace',
          fontSize: '26px',
          color: '#e8eef5',
        })
        .setOrigin(0.5)
        .setDepth(1);
    });
    this.add
      .text(s.x + s.w / 2, s.y + s.h / 2, 'WHOLESALE', {
        fontFamily: 'monospace',
        fontSize: '84px',
        color: '#3f4956',
      })
      .setOrigin(0.5)
      .setDepth(1);
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

  // Receiving yard: dock doors along the west wall with trailers backed in.
  drawDock(g) {
    const c = CFG.colors;
    const d = CFG.dock;
    g.fillStyle(c.dockPad, 1);
    g.fillRect(d.x, d.y, d.w, d.h);
    g.fillStyle(c.storeTrim, 1);
    g.fillRect(d.x + d.w - 12, d.y, 12, d.h);

    for (let y = d.y + 40; y < d.y + d.h - 110; y += 132) {
      g.fillStyle(0x1a1e24, 1);
      g.fillRect(d.x + d.w - 26, y, 20, 86);
      g.fillStyle(c.trailer, 1);
      g.fillRect(d.x + d.w - 300, y + 6, 274, 74);
      g.fillStyle(0x8f98a3, 1);
      g.fillRect(d.x + d.w - 300, y + 6, 18, 74);
      g.fillStyle(0x15181c, 1);
      g.fillRect(d.x + d.w - 190, y, 44, 8);
      g.fillRect(d.x + d.w - 190, y + 78, 44, 8);
    }
  }

  // Tyre centre off the east end, with its own little bay doors.
  drawAnnex(g) {
    const c = CFG.colors;
    const a = CFG.annex;
    g.fillStyle(c.storeRoof, 1);
    g.fillRect(a.x, a.y, a.w, a.h);
    g.fillStyle(c.store, 1);
    g.fillRect(a.x + 10, a.y + 10, a.w - 20, a.h - 20);
    g.fillStyle(c.hvac, 1);
    g.fillRect(a.x + 60, a.y + 60, 70, 44);
    g.fillStyle(c.doors, 1);
    for (let x = a.x + 34; x < a.x + a.w - 60; x += 86) {
      g.fillRect(x, a.y + a.h - 22, 62, 18);
    }
    this.add
      .text(a.x + a.w / 2, a.y + a.h / 2, 'TYRES', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#6d7a88',
      })
      .setOrigin(0.5)
      .setDepth(1);
  }

  drawDropZone() {
    const dz = CFG.dropZone;
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

  // Parked cars and the planters: the things the player physically bumps into.
  buildObstacles() {
    this.obstacles = this.physics.add.staticGroup();

    this.islands.forEach((i) => {
      const zone = this.add.zone(i.x + i.w / 2, i.y + i.h / 2, i.w - 6, i.h - 6);
      this.physics.add.existing(zone, true);
      this.obstacles.add(zone);
    });

    this.parked = [];
    CFG.stallRows.forEach((row, rowIndex) => {
      const cy = row.y + CFG.stallH / 2;
      CFG.fields.forEach((field) => {
        const { n, start } = this.fieldSlots(field);
        for (let i = 0; i < n; i++) {
          const x = start + i * CFG.stallW + CFG.stallW / 2;
          if (this.inIsland(x, cy) || this.inCorral(x, cy)) continue;
          if (Phaser.Math.Distance.Between(x, cy, CFG.moped.spawn.x, CFG.moped.spawn.y) < 90) {
            continue; // keep the versus rider's start clear
          }
          if (Math.random() > CFG.parkedFill) continue;

          // Body is the full texture rect, so nothing can be walked over.
          // Nose-out rows are flipped, not rotated: a static body reads its
          // extent from the rotated top-left corner, so an angled sprite
          // leaves its collision box offset from the car you can see.
          const car = this.obstacles
            .create(x, cy, Phaser.Utils.Array.GetRandom(BootScene.PARKED_KEYS))
            .setDepth(3)
            .setFlipY(rowIndex % 2 === 1);
          car.refreshBody();
          this.parked.push(car);
        }
      });
    });
  }

  buildCorrals() {
    const g = this.add.graphics().setDepth(1);
    this.carts = [];

    CFG.corrals.forEach((def) => {
      const w = CFG.stallW * 3;
      const h = CFG.stallH - 16;
      g.fillStyle(0xffe9a8, 0.12);
      g.fillRect(def.x - w / 2, def.y - h / 2, w, h);
      g.lineStyle(3, CFG.colors.corralRail, 0.9);
      g.strokeRoundedRect(def.x - w / 2, def.y - h / 2, w, h, 6);
      g.lineStyle(2, CFG.colors.corralRail, 0.35);
      g.strokeRoundedRect(def.x - w / 2 + 7, def.y - h / 2 + 7, w - 14, h - 14, 4);
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

    this.players.forEach((p) => {
      if (!p.alive) return;
      g.fillStyle(0x0e1116, 1);
      g.fillCircle(p.x, p.y, 54);
      g.fillStyle(p.tint, 1);
      g.fillCircle(p.x, p.y, 42);
    });
  }

  // ---------- traffic ----------

  buildTraffic() {
    this.lanes = CFG.aisles.map((def) => {
      const lane = { ...def, sprites: [] };
      this.prefillLane(lane);
      return lane;
    });
    this.buildCrossings();
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
            if (hLane.pos < this.laneFrom(vLane) || hLane.pos > this.laneTo(vLane)) return;
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

  prefillLane(lane) {
    const from = this.laneFrom(lane);
    const to = this.laneTo(lane);
    const start = Phaser.Math.Between(0, lane.gap);
    for (let c = from - 100 + start; c < to + 100; c += lane.gap) {
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

  updateLane(lane, dt) {
    const v = lane.dir * lane.speed * this.speedMul * dt;
    const from = this.laneFrom(lane);
    const to = this.laneTo(lane);

    for (let i = lane.sprites.length - 1; i >= 0; i--) {
      const s = lane.sprites[i];
      if (!this.mustYield(s, lane)) {
        if (lane.axis === 'x') s.x += v;
        else s.y += v;
      }

      const coord = lane.axis === 'x' ? s.x : s.y;
      // Despawn well outside the spawn edge, so a fresh car is never culled
      // on its first frame. Texture length always runs along travel.
      const margin = s.width / 2 + 60;
      if (coord < from - margin || coord > to + margin) {
        s.destroy();
        lane.sprites.splice(i, 1);
      }
    }

    const spawnAt = lane.dir === 1 ? from - 90 : to + 90;
    if (lane.sprites.length === 0) {
      this.spawnVehicle(lane, spawnAt);
      return;
    }

    const coords = lane.sprites.map((s) => (lane.axis === 'x' ? s.x : s.y));
    if (lane.dir === 1) {
      if (Math.min(...coords) >= from + lane.gap - 90) this.spawnVehicle(lane, spawnAt);
    } else if (Math.max(...coords) <= to + 90 - lane.gap) {
      this.spawnVehicle(lane, spawnAt);
    }
  }

  // ---------- pedestrians ----------

  buildPeds() {
    this.peds = this.physics.add.group();
    for (let i = 0; i < CFG.peds.count; i++) this.spawnPed();
    this.physics.add.collider(this.peds, this.obstacles, (ped) => this.unstick(ped));
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
    const wasd = this.input.keyboard.addKeys('W,A,S,D');
    const arrowSet = {
      up: cursors.up,
      down: cursors.down,
      left: cursors.left,
      right: cursors.right,
    };
    const wasdSet = { up: wasd.W, down: wasd.S, left: wasd.A, right: wasd.D };

    this.players = [];
    if (this.mode === 'solo') {
      // Solo answers to both key sets.
      this.players.push(new LotPlayer(this, 0, [arrowSet, wasdSet]));
    } else {
      this.players.push(new LotPlayer(this, 0, [arrowSet]));
      this.players.push(
        this.mode === 'versus'
          ? new MopedPlayer(this, 1, wasdSet)
          : new LotPlayer(this, 1, [wasdSet])
      );
    }

    this.players.forEach((p) => this.physics.add.collider(p.sprite, this.obstacles));
    this.driver = this.players.find((p) => p.kind === 'driver') || null;
  }

  bindInput() {
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
    this.input.keyboard.on('keydown-M', () => {
      this.scene.stop('Hud');
      this.scene.start('Menu');
    });
  }

  // Only attendants hold lives and clear the lot; the driver just racks up hits.
  activeAttendants() {
    return this.players.filter((p) => p.alive && p.canPushCarts);
  }

  tryPickup(p, now) {
    if (p.train.length >= p.maxTrain(now)) return;
    const cart = this.carts.find(
      (c) =>
        c.state === 'idle' &&
        Phaser.Math.Distance.Between(c.sprite.x, c.sprite.y, p.x, p.y) < 30
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
    const dz = CFG.dropZone;
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
      // Not on top of the return zone, another badge, or anyone's feet.
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

    this.players.forEach((p) => {
      p.handleInput(time, dt);
      p.updateTrain();
      p.updateEffects(time);
      if (!p.alive || !p.canPushCarts) return;

      this.tryPickup(p, time);
      this.tryDeliver(p);

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

    if (this.driver && this.driver.alive) {
      this.driverHazards(this.driver, time);
      this.scatterCarts(this.driver);
    }

    for (const p of this.players) {
      if (!p.alive || !p.canPushCarts || time < p.invulnUntil) continue;

      if (this.hitByTraffic(p)) {
        if (!this.absorbHit(p, time)) this.runOver(p, time);
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
      } else if (this.hitByPed(p) && !p.hasEffect('shield', time)) {
        // Shoppers just bounce off a shield — it only breaks on a motor.
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
