// Open parking lot. Collect carts from the corrals, push them back to the store
// entrance, don't get run over. Player, pedestrians and parked cars use arcade
// physics; traffic and cart pickups use plain rect/distance tests, which is
// cheaper and easier to tune than more collider pairs.
class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create() {
    this.physics.world.setBounds(0, 0, CFG.width, CFG.height);

    this.mode = this.registry.get('mode') || 'solo';
    this.playerCount = this.mode === 'solo' ? 1 : 2;
    this.level = 1;
    this.speedMul = 1;
    this.timeLeft = CFG.levelSeconds;
    this.gameOver = false;

    this.drawLot();
    this.buildObstacles();
    this.buildCorrals();
    this.buildTraffic();
    this.buildPeds();
    this.createPlayers();
    this.bindInput();
    this.publish();
  }

  // ---------- static world ----------

  drawLot() {
    const c = CFG.colors;
    const half = CFG.laneWidth / 2;
    const g = this.add.graphics().setDepth(0);

    g.fillStyle(c.asphalt, 1);
    g.fillRect(0, 0, CFG.width, CFG.height);

    // stall stripes, skipped where the vertical drive lane cuts through
    g.fillStyle(c.stallPaint, 0.55);
    CFG.stallRows.forEach((row) => {
      for (let x = CFG.stallMargin; x <= CFG.width - CFG.stallMargin; x += CFG.stallW) {
        if (this.inVerticalLane(x)) continue;
        g.fillRect(x - 1, row.y + 4, 2, CFG.stallH - 8);
      }
      g.fillRect(CFG.stallMargin, row.y + 2, CFG.width - CFG.stallMargin * 2, 2);
    });

    // driving aisles read darker than the stall bands
    CFG.aisles.forEach((a) => {
      g.fillStyle(c.aisle, 1);
      if (a.axis === 'x') {
        g.fillRect(0, a.pos - half, CFG.width, CFG.laneWidth);
      } else {
        g.fillRect(a.pos - half, CFG.sidewalk.y, CFG.laneWidth, CFG.height - CFG.sidewalk.y);
      }
      g.fillStyle(c.stallPaint, 0.35);
      if (a.axis === 'x') {
        for (let x = 0; x < CFG.width; x += 34) g.fillRect(x, a.pos - 1, 18, 2);
      } else {
        for (let y = CFG.sidewalk.y; y < CFG.height; y += 34) g.fillRect(a.pos - 1, y, 2, 18);
      }
    });

    // sidewalk + storefront
    g.fillStyle(c.sidewalk, 1);
    g.fillRect(0, CFG.sidewalk.y, CFG.width, CFG.sidewalk.h);
    g.fillStyle(c.store, 1);
    g.fillRect(CFG.store.x, CFG.store.y, CFG.store.w, CFG.store.h);
    g.fillStyle(c.storeTrim, 1);
    g.fillRect(0, CFG.store.h - 8, CFG.width, 8);
    g.fillStyle(c.doors, 1);
    g.fillRect(CFG.dropZone.x - 110, CFG.store.h - 34, 220, 26);

    this.add
      .text(CFG.width / 2, 34, 'GROCERY', {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: '#8fa0b3',
      })
      .setOrigin(0.5)
      .setDepth(1);

    const dz = CFG.dropZone;
    this.add
      .rectangle(dz.x, dz.y, dz.w, dz.h, c.dropZone, 0.3)
      .setStrokeStyle(2, c.dropZone)
      .setDepth(1);
    this.add
      .text(dz.x, dz.y, 'CART RETURN', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#7fd6a6',
      })
      .setOrigin(0.5)
      .setDepth(2);
  }

  inVerticalLane(x) {
    return CFG.aisles.some(
      (a) => a.axis === 'y' && Math.abs(a.pos - x) < CFG.laneWidth / 2 + CFG.stallW / 2
    );
  }

  inCorral(x, y) {
    return CFG.corrals.some(
      (c) =>
        Math.abs(c.x - x) < CFG.stallW * 1.5 + 20 && Math.abs(c.y - y) < CFG.stallH / 2
    );
  }

  // Parked cars and the store wall: the things the player physically bumps into.
  buildObstacles() {
    this.obstacles = this.physics.add.staticGroup();

    const wall = this.add.zone(CFG.width / 2, CFG.store.h / 2, CFG.width, CFG.store.h);
    this.physics.add.existing(wall, true);
    this.obstacles.add(wall);

    this.parked = [];
    CFG.stallRows.forEach((row, rowIndex) => {
      const cy = row.y + CFG.stallH / 2;
      for (
        let x = CFG.stallMargin + CFG.stallW / 2;
        x <= CFG.width - CFG.stallMargin;
        x += CFG.stallW
      ) {
        if (this.inCorral(x, cy) || this.inVerticalLane(x)) continue;
        if (Phaser.Math.Distance.Between(x, cy, CFG.moped.spawn.x, CFG.moped.spawn.y) < 80) {
          continue; // keep the versus car's start clear
        }
        if (Math.random() > CFG.parkedFill) continue;

        // Body is the full texture rect, so nothing can be walked over.
        const car = this.obstacles
          .create(x, cy, Phaser.Utils.Array.GetRandom(BootScene.PARKED_KEYS))
          .setDepth(3)
          .setAngle(rowIndex % 2 === 0 ? 0 : 180);
        car.refreshBody();
        this.parked.push(car);
      }
    });
  }

  buildCorrals() {
    const g = this.add.graphics().setDepth(1);
    this.carts = [];

    CFG.corrals.forEach((def) => {
      const w = CFG.stallW * 3;
      const h = CFG.stallH - 12;
      g.lineStyle(3, CFG.colors.corralRail, 0.9);
      g.strokeRoundedRect(def.x - w / 2, def.y - h / 2, w, h, 6);
      g.lineStyle(2, CFG.colors.corralRail, 0.35);
      g.strokeRoundedRect(def.x - w / 2 + 7, def.y - h / 2 + 7, w - 14, h - 14, 4);
    });

    this.spawnCarts();
  }

  spawnCarts() {
    CFG.corrals.forEach((def) => {
      for (let i = 0; i < def.carts; i++) {
        const home = { x: def.x - ((def.carts - 1) * 38) / 2 + i * 38, y: def.y };
        const sprite = this.add.image(home.x, home.y, 'cart').setDepth(4);
        this.carts.push({ sprite, home, state: 'idle' });
      }
    });
    this.cartsTotal = this.carts.length;
    this.cartsDelivered = 0;
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
              const dot = this.add.circle(spot.x, spot.y, 4, 0xc9524f, 0.9).setDepth(6);
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
    const start = Phaser.Math.Between(0, lane.gap);
    for (let c = -100 + start; c < this.laneExtent(lane) + 100; c += lane.gap) {
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

    // Park off-screen spawns clear of the despawn margin, which scales with the
    // car's own length — otherwise a short car is culled the frame it appears.
    const extent = this.laneExtent(lane);
    let c = coord;
    if (c < 0) c = -(sprite.width / 2 + 30);
    else if (c > extent) c = extent + sprite.width / 2 + 30;
    if (lane.axis === 'x') sprite.x = c;
    else sprite.y = c;

    lane.sprites.push(sprite);
  }

  // Cars on the vertical lane give way at the aisle crossings instead of
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
    const extent = this.laneExtent(lane);

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
      if (coord < -margin || coord > extent + margin) {
        s.destroy();
        lane.sprites.splice(i, 1);
      }
    }

    const spawnAt = lane.dir === 1 ? -90 : extent + 90;
    if (lane.sprites.length === 0) {
      this.spawnVehicle(lane, spawnAt);
      return;
    }

    const coords = lane.sprites.map((s) => (lane.axis === 'x' ? s.x : s.y));
    if (lane.dir === 1) {
      if (Math.min(...coords) >= lane.gap - 90) this.spawnVehicle(lane, spawnAt);
    } else if (Math.max(...coords) <= extent + 90 - lane.gap) {
      this.spawnVehicle(lane, spawnAt);
    }
  }

  // ---------- pedestrians ----------

  buildPeds() {
    this.peds = this.physics.add.group();
    for (let i = 0; i < CFG.peds.count; i++) this.spawnPed();
    this.physics.add.collider(this.peds, this.obstacles, (ped) => this.retarget(ped));
  }

  spawnPed() {
    const x = Phaser.Math.Between(60, CFG.width - 60);
    const y = Phaser.Math.Between(CFG.sidewalk.y + 24, CFG.height - 40);
    const ped = this.peds
      .create(x, y, Phaser.Utils.Array.GetRandom(BootScene.PED_KEYS))
      .setDepth(6);
    ped.body.setCircle(9, 5, 3);
    ped.setCollideWorldBounds(true);
    this.retarget(ped);
    return ped;
  }

  retarget(ped) {
    // Shoppers drift between the lot and the storefront, pausing to load bags.
    ped.target = {
      x: Phaser.Math.Between(40, CFG.width - 40),
      y:
        Math.random() < 0.4
          ? Phaser.Math.Between(CFG.sidewalk.y, CFG.sidewalk.y + 60)
          : Phaser.Math.Between(CFG.sidewalk.y + 40, CFG.height - 30),
    };
    ped.pauseUntil = 0;
  }

  updatePeds(now) {
    const speed = CFG.peds.speed * this.speedMul;
    this.peds.children.iterate((ped) => {
      if (!ped) return;
      if (now < ped.pauseUntil) {
        ped.body.setVelocity(0, 0);
        return;
      }
      if (Math.random() < CFG.peds.pauseChance) {
        ped.pauseUntil = now + Phaser.Math.Between(500, 1600);
        return;
      }
      const d = Phaser.Math.Distance.Between(ped.x, ped.y, ped.target.x, ped.target.y);
      if (d < 14) {
        this.retarget(ped);
        return;
      }
      this.physics.moveTo(ped, ped.target.x, ped.target.y, speed);
      ped.setRotation(ped.body.velocity.angle());
    });
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

  tryPickup(p) {
    if (p.train.length >= CFG.cart.maxTrain) return;
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
        20,
        CFG.width - 20
      );
      cart.sprite.y = Phaser.Math.Clamp(
        cart.sprite.y + Phaser.Math.Between(-20, 20),
        CFG.store.h + 16,
        CFG.height - 20
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

  // ---------- hazards ----------

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
      }
      this.shove(cart.sprite, car);
    });
  }

  shove(target, car) {
    const angle = Phaser.Math.Angle.Between(car.x, car.y, target.x, target.y);
    const push = 26;
    target.x = Phaser.Math.Clamp(target.x + Math.cos(angle) * push, 20, CFG.width - 20);
    target.y = Phaser.Math.Clamp(
      target.y + Math.sin(angle) * push,
      CFG.store.h + 16,
      CFG.height - 20
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
    this.activePlayers().forEach((p) => {
      p.score += bonus;
      p.train = [];
    });
    this.timeLeft = CFG.levelSeconds;

    this.carts.forEach((c) => c.sprite && c.sprite.destroy());
    this.carts = [];
    this.spawnCarts();
    this.spawnPed();

    this.banner(CFG.width / 2, CFG.height / 2, `LOT ${this.level}`, '#8fc4ec');
    this.publish();
  }

  endGame(outcome) {
    this.gameOver = true;
    const cx = CFG.width / 2;
    const cy = CFG.height / 2;

    this.add.rectangle(cx, cy, CFG.width, 180, 0x000000, 0.82).setDepth(20);

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

    this.add
      .text(cx, cy - 44, headline, {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#e8eef5',
      })
      .setOrigin(0.5)
      .setDepth(21);

    const scores =
      this.players.length === 1
        ? `score ${this.players[0].score}`
        : this.players.map((p) => `${p.label} ${p.score}`).join('   ·   ');
    this.add
      .text(cx, cy - 4, scores, {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#cbd6e2',
      })
      .setOrigin(0.5)
      .setDepth(21);

    if (verdict) {
      this.add
        .text(cx, cy + 26, verdict, {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: '#7fd6a6',
        })
        .setOrigin(0.5)
        .setDepth(21);
    }

    this.add
      .text(cx, cy + 60, 'R restart  ·  M menu', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#8a97a6',
      })
      .setOrigin(0.5)
      .setDepth(21);
  }

  flash(color) {
    const rect = this.add
      .rectangle(CFG.width / 2, CFG.height / 2, CFG.width, CFG.height, color, 0.25)
      .setDepth(15);
    this.tweens.add({
      targets: rect,
      alpha: 0,
      duration: 280,
      onComplete: () => rect.destroy(),
    });
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
    this.registry.set('hud', {
      level: this.level,
      left: this.cartsTotal - this.cartsDelivered,
      time: Math.max(0, this.timeLeft),
      maxTrain: CFG.cart.maxTrain,
      mode: this.mode,
      players: this.players.map((p) => ({
        label: p.label,
        kind: p.kind,
        score: p.score,
        lives: p.lives === null ? null : Math.max(0, p.lives),
        train: p.train.length,
        takedowns: p.takedowns || 0,
        alive: p.alive,
      })),
    });
  }

  // ---------- loop ----------

  update(time, delta) {
    const dt = delta / 1000;
    this.updateLights(time / 1000);
    this.lanes.forEach((lane) => this.updateLane(lane, dt));
    if (this.gameOver) return;

    this.updatePeds(time);

    this.players.forEach((p) => {
      p.handleInput(time, dt);
      p.updateTrain();
      if (!p.alive || !p.canPushCarts) return;

      this.tryPickup(p);
      this.tryDeliver(p);
      const blink = time < p.invulnUntil && Math.floor(time / 90) % 2 ? 0.35 : 1;
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
        this.runOver(p, time);
      } else if (
        this.driver &&
        this.driver.alive &&
        Phaser.Math.Distance.Between(this.driver.x, this.driver.y, p.x, p.y) <
          CFG.moped.hitRadius
      ) {
        this.rundown(this.driver, p, time);
      } else if (this.hitByPed(p)) {
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
