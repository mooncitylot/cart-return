// A decorative interior shopper: wanders the aisle lanes, pauses at a
// checkout counter now and then, and keeps looping. Purely cosmetic — no
// Arcade body, no collision with the player or shelves. It never needs to
// dodge anything because it never moves diagonally across a shelf: every
// route is laid out as an L (or Z) of straight legs that only ever cross
// between lanes while standing on a row outside the shelf band — see
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
    const lanes = CFG.interior.aisleLaneX;
    const { top, bottom } = CFG.interior.aisleY;
    this.state = 'aisle';
    this.setRoute({
      x: Phaser.Utils.Array.GetRandom(lanes),
      y: Math.random() < 0.5 ? top : bottom,
    });
  }

  pickCheckout() {
    this.state = 'checkout';
    this.setRoute(Phaser.Utils.Array.GetRandom(CFG.interior.vestibule.checkout));
  }

  // Lays out a straight-leg route to `goal` that never cuts diagonally
  // through a shelf. The shelf band is CFG.interior.aisles' y-extent; a
  // shopper only ever crosses between lanes while standing on a row outside
  // it, so: step clear of the band vertically first if standing inside it,
  // then travel to the target lane while still on that safe row, then
  // finish with a straight vertical walk up the new lane to the goal.
  setRoute(goal) {
    const a = CFG.interior.aisles[0];
    const bandTop = a.y;
    const bandBottom = a.y + a.h;
    const path = [];
    let fromY = this.y;

    if (fromY > bandTop && fromY < bandBottom) {
      fromY = fromY - bandTop < bandBottom - fromY ? bandTop : bandBottom;
      path.push({ x: this.x, y: fromY });
    }
    if (Math.abs(goal.x - this.x) > 1) path.push({ x: goal.x, y: fromY });
    path.push(goal);

    this.waypoints = path;
    this.goal = this.waypoints.shift();
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
