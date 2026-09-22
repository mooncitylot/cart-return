// A decorative interior shopper: wanders the aisle lanes, pauses at a
// checkout counter now and then, and keeps looping. Purely cosmetic — no
// Arcade body, no collision with the player or shelves (its waypoints are
// always lane centrelines, so it never needs to dodge anything), and no tie
// into the real cart/corral economy, which stays exterior. GameScene owns
// the pool's lifecycle: see buildInteriorPeds()/updateInteriorPeds()/
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
    this.pickAisleGoal();
  }

  pickAisleGoal() {
    const lanes = CFG.interior.aisleLaneX;
    const { top, bottom } = CFG.interior.aisleY;
    this.goal = {
      x: Phaser.Utils.Array.GetRandom(lanes),
      y: Math.random() < 0.5 ? top : bottom,
    };
    this.state = 'aisle';
  }

  pickCheckout() {
    this.goal = Phaser.Utils.Array.GetRandom(CFG.interior.vestibule.checkout);
    this.state = 'checkout';
  }

  update(now) {
    if (now < this.pauseUntil) return;

    const d = Phaser.Math.Distance.Between(this.x, this.y, this.goal.x, this.goal.y);
    if (d < 14) {
      this.arrived(now);
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
