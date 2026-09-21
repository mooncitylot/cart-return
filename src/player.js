// One lot attendant. Holds the per-player state that used to live on the scene,
// so solo, co-op and versus runs are the same code path with a different roster.
class LotPlayer {
  constructor(scene, index, keySets, opts = {}) {
    this.scene = scene;
    this.index = index;
    this.label = opts.label || `P${index + 1}`;
    this.kind = opts.kind || 'attendant';
    this.canPushCarts = opts.canPushCarts !== false;
    this.keySets = keySets; // each: { up, down, left, right } Phaser Keys

    // Solo starts dead centre of the return zone; two players start either side.
    const offset = scene.playerCount > 1 ? (index === 0 ? -60 : 60) : 0;
    this.spawn = opts.spawn || { x: CFG.dropZone.x + offset, y: CFG.player.spawn.y };

    this.tint = opts.tint || (index === 0 ? 0x6bd6a5 : 0xf5b45f);
    this.sprite = scene.physics.add
      .image(this.spawn.x, this.spawn.y, opts.texture || `player_${index + 1}`)
      .setDepth(opts.depth || 8);
    const body = opts.bodyRadius || 10;
    this.sprite.body.setCircle(
      body,
      this.sprite.width / 2 - body,
      this.sprite.height / 2 - body
    );
    this.sprite.setCollideWorldBounds(true);

    // Ring under the feet: tells you apart from the shoppers at a glance.
    this.marker = scene.add
      .circle(this.spawn.x, this.spawn.y, opts.markerRadius || 15)
      .setStrokeStyle(2, this.tint, 0.85)
      .setDepth(7);

    this.facing = new Phaser.Math.Vector2(0, 1); // pushing away from the store
    this.train = [];
    this.trail = [];
    this.trailStep = 4; // px between recorded trail points
    this.score = 0;
    this.lives = CFG.lives;
    this.alive = true;
    this.stunUntil = 0;
    this.invulnUntil = 0;
    // Held until the attendant walks clear of their respawn point, so the
    // rider can't camp the return zone and farm the same player.
    this.spawnSafe = true;

    // Power-up effects: kind -> the timestamp it runs out at. Wiped on respawn,
    // so losing a life costs you whatever you were carrying.
    this.effects = {};
    // Rings around the marker, one per running effect.
    this.aura = scene.add.graphics().setDepth(6);
  }

  get x() {
    return this.sprite.x;
  }

  get y() {
    return this.sprite.y;
  }

  // Speed boosts scale the floor as well as the ceiling, so the boost is still
  // worth something to someone dragging a full train.
  speed() {
    const now = this.scene.time.now;
    const boost = this.hasEffect('speed', now) ? Powerup.def('speed').mul : 1;
    const perCart =
      CFG.player.speedPerCart *
      (this.hasEffect('strength', now) ? Powerup.def('strength').cartEase : 1);
    return Math.max(
      CFG.player.minSpeed * boost,
      CFG.player.speed * boost - this.train.length * perCart
    );
  }

  // How many carts this player may be pushing right now. Strength only gates
  // new pickups: a train already gathered keeps following once it lapses.
  maxTrain(now) {
    const extra = this.hasEffect('strength', now) ? Powerup.def('strength').extraTrain : 0;
    return CFG.cart.maxTrain + extra;
  }

  // ---- power-ups ----

  // Picking the same kind up again tops the timer up rather than restarting it.
  grant(kind, now) {
    this.effects[kind] = Math.max(this.effects[kind] || 0, now) + Powerup.def(kind).ms;
  }

  hasEffect(kind, now) {
    return (this.effects[kind] || 0) > now;
  }

  effectLeft(kind, now) {
    return Math.max(0, (this.effects[kind] || 0) - now);
  }

  clearEffect(kind) {
    delete this.effects[kind];
  }

  clearEffects() {
    this.effects = {};
    this.aura.clear();
  }

  // In config order, so the HUD never reshuffles as effects come and go.
  activeEffects(now) {
    return CFG.powerups.kinds
      .filter((k) => this.hasEffect(k.key, now))
      .map((k) => ({ key: k.key, label: k.label, left: this.effectLeft(k.key, now) }));
  }

  // One ring per running effect, stacked outwards from the marker, each
  // blinking over its last moments.
  updateEffects(now) {
    const g = this.aura;
    g.clear();
    if (!this.alive) return;
    g.setPosition(this.x, this.y);
    this.activeEffects(now).forEach((e, i) => {
      const dim = e.left < CFG.powerups.warnMs && Math.floor(now / 110) % 2;
      g.lineStyle(2, Powerup.def(e.key).color, dim ? 0.2 : 0.85);
      g.strokeCircle(0, 0, 20 + i * 5);
    });
  }

  // Sums every key set bound to this player, so solo play answers to both
  // arrows and WASD while two-player splits them.
  readDirection() {
    let x = 0;
    let y = 0;
    this.keySets.forEach((k) => {
      if (k.left.isDown) x -= 1;
      if (k.right.isDown) x += 1;
      if (k.up.isDown) y -= 1;
      if (k.down.isDown) y += 1;
    });
    return new Phaser.Math.Vector2(Phaser.Math.Clamp(x, -1, 1), Phaser.Math.Clamp(y, -1, 1));
  }

  handleInput(now) {
    const body = this.sprite.body;
    if (!this.alive || now < this.stunUntil) {
      body.setVelocity(0, 0);
      return;
    }

    const v = this.readDirection();
    if (v.x === 0 && v.y === 0) {
      body.setVelocity(0, 0);
      return;
    }

    v.normalize();
    this.facing.set(v.x, v.y);
    body.setVelocity(v.x * this.speed(), v.y * this.speed());
    this.sprite.setRotation(v.angle());
  }

  // Where cart `index` of the train belongs when there is no trail to follow
  // yet: strung out behind the player, opposite the way they are facing.
  cartTarget(index) {
    const dist = (index + 1) * CFG.cart.spacing + 12;
    return {
      x: Phaser.Math.Clamp(this.x - this.facing.x * dist, CFG.lot.x1 + 8, CFG.lot.x2 - 8),
      y: Phaser.Math.Clamp(this.y - this.facing.y * dist, CFG.sidewalk.y + 8, CFG.lot.y2 - 8),
    };
  }

  // Carts trail the player along the path actually walked, spaced by real
  // distance travelled, so the train looks the same at any speed.
  updateTrain() {
    this.marker.setPosition(this.x, this.y);

    const head = this.trail[0];
    if (!head || Phaser.Math.Distance.Between(head.x, head.y, this.x, this.y) >= this.trailStep) {
      this.trail.unshift({ x: this.x, y: this.y, r: this.sprite.rotation });
      // Sized off the train actually held, so a strength-boosted one still has
      // enough recorded path behind it to string out along.
      const carts = Math.max(this.train.length, CFG.cart.maxTrain);
      const max = Math.ceil(((carts + 1) * CFG.cart.spacing) / this.trailStep) + 8;
      if (this.trail.length > max) this.trail.length = max;
    }
    if (this.train.length === 0) return;

    let idx = 0;
    let walked = 0;
    this.train.forEach((cart, i) => {
      const want = (i + 1) * CFG.cart.spacing;
      while (idx < this.trail.length - 1 && walked < want) {
        const a = this.trail[idx];
        const b = this.trail[idx + 1];
        walked += Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        idx += 1;
      }
      const point = this.trail[Math.min(idx, this.trail.length - 1)];
      if (!point) return;
      cart.sprite.setPosition(point.x, point.y).setRotation(point.r);
    });
  }

  respawn(now, invulnMs) {
    this.spawnSafe = true;
    this.clearEffects();
    this.sprite.setPosition(this.spawn.x, this.spawn.y);
    this.marker.setPosition(this.spawn.x, this.spawn.y);
    this.sprite.body.setVelocity(0, 0);
    this.trail.length = 0;
    this.stunUntil = now + 300;
    this.invulnUntil = now + invulnMs;
  }

  eliminate() {
    this.alive = false;
    this.clearEffects();
    this.marker.setVisible(false);
    this.sprite.setVisible(false);
    this.sprite.body.setVelocity(0, 0);
    this.sprite.body.enable = false;
  }
}
