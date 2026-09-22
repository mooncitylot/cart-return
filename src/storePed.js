// A decorative interior shopper: wanders the aisle lanes, queues at a
// checkout lane now and then, and keeps looping. Purely cosmetic — no
// Arcade body, no collision with the player or the racking. It never needs
// to dodge anything because it never moves diagonally across a bay: every
// route is laid out as an L (or Z) of straight legs that only ever cross
// between lanes while standing on one of the store's cross aisles — see
// setRoute() — so a shopper reads as walking the aisles, not through them.
// No tie into the real cart/corral economy, which stays exterior. GameScene
// owns the pool's lifecycle: see buildInteriorPeds()/updateInteriorPeds()/
// clearInteriorPeds() in GameScene.js.
class StorePed {
  constructor(scene) {
    this.scene = scene;

    const lanes = CFG.interior.aisleLaneX;
    const { top, bottom } = CFG.interior.aisleY;
    this.x = Phaser.Utils.Array.GetRandom(lanes);
    this.y = Phaser.Math.Between(top, bottom);

    this.img = scene.add
      .image(this.x, this.y, Phaser.Utils.Array.GetRandom(BootScene.PED_KEYS))
      .setDepth(6)
      .setAlpha(0);
    scene.tweens.add({ targets: this.img, alpha: 1, duration: 300 });

    // About half push a cart around with them.
    this.hasCart = Math.random() < 0.5;
    this.cartImg = null;
    if (this.hasCart) {
      this.cartImg = scene.add.image(this.x, this.y, 'cart').setDepth(5).setAlpha(0);
      scene.tweens.add({ targets: this.cartImg, alpha: 1, duration: 300 });
    }

    this.speed = 46;
    this.pauseUntil = 0;
    this.waypoints = [];
    this.pickAisleGoal();
  }

  pickAisleGoal() {
    this.state = 'aisle';
    this.setRoute({
      x: Phaser.Utils.Array.GetRandom(CFG.interior.aisleLaneX),
      y: Phaser.Utils.Array.GetRandom(CFG.interior.crossRows),
    });
  }

  // Queue at a lane rather than stand on its belt: the goal is the head of
  // the belt, which is the side of the counter a member waits on.
  pickCheckout() {
    const c = Phaser.Utils.Array.GetRandom(CFG.interior.vestibule.checkout);
    this.state = 'checkout';
    this.setRoute({ x: c.x, y: c.y - 84 });
  }

  // Lays out a straight-leg route to `goal` that never cuts through a
  // fixture. CFG.interior.crossRows are the rows running clear of every
  // racking bay — the back cross aisle, the mid-store one and the front
  // one feeding the registers — and a shopper only ever changes lane while
  // standing on one of them: walk to the cross row, cross along it, then
  // walk down to the goal. Three of them rather than one means a shopper
  // can cut through the middle of the store instead of always walking the
  // whole run out to an end, which is what people actually do.
  //
  // Which row is not just "the nearest": both vertical legs have to clear
  // the fixtures too, and a register is reachable in a straight line only
  // from the cross aisle in front of it, not from one behind the racking.
  setRoute(goal) {
    const rows = CFG.interior.crossRows;
    const usable = rows.filter(
      (row) => this.clearColumn(this.x, this.y, row) && this.clearColumn(goal.x, row, goal.y)
    );
    const cost = (row) => Math.abs(row - this.y) + Math.abs(row - goal.y);
    const crossY = (usable.length ? usable : rows).reduce((best, row) =>
      cost(row) < cost(best) ? row : best
    );

    const path = [];
    if (Math.abs(goal.x - this.x) > 1) {
      if (Math.abs(crossY - this.y) > 1) path.push({ x: this.x, y: crossY });
      path.push({ x: goal.x, y: crossY });
    }
    path.push(goal);

    this.waypoints = path;
    this.goal = this.waypoints.shift();
  }

  // Does a straight vertical walk at `x` between two rows clear every
  // fixture on the sales floor?
  clearColumn(x, ya, yb) {
    const top = Math.min(ya, yb);
    const bottom = Math.max(ya, yb);
    return !StorePed.solids().some(
      (s) => x > s.x - 8 && x < s.x + s.w + 8 && s.y < bottom && s.y + s.h > top
    );
  }

  // Everything on the sales floor a shopper has to walk around, as plain
  // rects. A StorePed has no Arcade body, so it routes against these
  // rather than colliding with the scenery group GameScene builds from the
  // same config.
  static solids() {
    if (StorePed._solids) return StorePed._solids;
    const it = CFG.interior;
    const out = [];
    it.aisleCols.forEach((x) =>
      it.aisleBays.forEach((b) => out.push({ x, y: b.y, w: it.aisleW, h: b.h }))
    );
    it.frontTables.forEach((t) => out.push({ x: t.x, y: t.y, w: t.w, h: t.h }));
    it.departments.forEach((d) => out.push({ x: d.x, y: d.y, w: d.w, h: d.h }));
    StorePed._solids = out;
    return out;
  }

  update(now) {
    if (now < this.pauseUntil) return;

    const d = Phaser.Math.Distance.Between(this.x, this.y, this.goal.x, this.goal.y);
    if (d < 14) {
      // Snap exactly onto the waypoint just reached — an intermediate leg's
      // arrival tolerance would otherwise leave a few px of drift on the row
      // a following horizontal leg relies on being clear of every shelf.
      this.x = this.goal.x;
      this.y = this.goal.y;
      if (this.waypoints.length) {
        this.goal = this.waypoints.shift();
      } else {
        this.arrived(now);
      }
      return;
    }

    const a = Phaser.Math.Angle.Between(this.x, this.y, this.goal.x, this.goal.y);
    const step = (this.speed * this.scene.speedMul) / 60;
    this.x += Math.cos(a) * step;
    this.y += Math.sin(a) * step;
    this.img.setPosition(this.x, this.y).setRotation(a);
    if (this.cartImg) {
      const d2 = 20;
      this.cartImg.setPosition(this.x + Math.cos(a) * d2, this.y + Math.sin(a) * d2).setRotation(a);
    }
  }

  // Browse an aisle, occasionally detour to a checkout counter to "check
  // out", then pick a new aisle — an endless, cosmetic loop.
  arrived(now) {
    if (this.state === 'aisle') {
      this.pauseUntil = now + Phaser.Math.Between(400, 1200);
      if (Math.random() < 0.35) this.pickCheckout();
      else this.pickAisleGoal();
    } else {
      this.pauseUntil = now + Phaser.Math.Between(800, 1800);
      if (!this.hasCart && Math.random() < 0.5) {
        this.hasCart = true;
        this.cartImg = this.scene.add
          .image(this.x, this.y, 'cart')
          .setDepth(5)
          .setAlpha(0);
        this.scene.tweens.add({ targets: this.cartImg, alpha: 1, duration: 260 });
      }
      this.pickAisleGoal();
    }
  }

  destroy() {
    this.img.destroy();
    if (this.cartImg) this.cartImg.destroy();
  }
}
