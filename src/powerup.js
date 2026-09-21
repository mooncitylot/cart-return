// One badge lying in the lot. Walk over it and it hands the attendant a timed
// effect; the effect itself lives on LotPlayer, so solo, co-op and versus all
// get it without special cases.
//
// The kinds are data in CFG.powerups.kinds. Adding a fourth means a row there,
// an icon in BootScene.makePowerup(), and a branch in LotPlayer for what it
// actually does.
class Powerup {
  static def(key) {
    return CFG.powerups.kinds.find((k) => k.key === key);
  }

  // Weighted roll, so a kind can be made rare from config alone.
  static rollKind() {
    const kinds = CFG.powerups.kinds;
    const total = kinds.reduce((n, k) => n + k.weight, 0);
    let pick = Math.random() * total;
    return (kinds.find((k) => (pick -= k.weight) <= 0) || kinds[0]).key;
  }

  constructor(scene, key, x, y, now) {
    this.key = key;
    this.def = Powerup.def(key);
    this.expiresAt = now + CFG.powerups.lifetime * 1000;

    this.ring = scene.add.circle(x, y, 19).setStrokeStyle(2, this.def.color, 0.55).setDepth(4);
    this.sprite = scene.add.image(x, y, `power_${key}`).setDepth(6);

    // Breathing, so a badge sitting out in a drive aisle still catches the eye
    // against moving traffic.
    this.pulse = scene.tweens.add({
      targets: [this.sprite, this.ring],
      scale: { from: 0.88, to: 1.12 },
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  get x() {
    return this.sprite.x;
  }

  get y() {
    return this.sprite.y;
  }

  // Blinks out over its last moments, so nobody sprints across two aisles for
  // something that is about to vanish. Returns false once it is spent.
  update(now) {
    const left = this.expiresAt - now;
    const dim = left < CFG.powerups.warnMs && Math.floor(now / 110) % 2;
    this.sprite.setAlpha(dim ? 0.25 : 1);
    this.ring.setAlpha(dim ? 0.15 : 0.55);
    return left > 0;
  }

  destroy() {
    this.pulse.remove();
    this.sprite.destroy();
    this.ring.destroy();
  }
}
