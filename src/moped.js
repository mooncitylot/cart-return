// Versus mode: the second player rides a moped instead of walking. Same eight-way
// controls and the same top speed as an attendant — the edge is that it never
// slows for a cart train, and it flattens anyone it touches. Extending LotPlayer
// keeps the scene's player loop unchanged.
class MopedPlayer extends LotPlayer {
  constructor(scene, index, keySet) {
    super(scene, index, [keySet], {
      label: 'RIDER',
      kind: 'driver',
      canPushCarts: false,
      texture: 'moped',
      spawn: { ...CFG.moped.spawn },
      tint: 0xef5f8c,
      bodyRadius: 11,
      markerRadius: 18,
      depth: 9,
    });

    this.lives = null; // the rider cannot be knocked out, only scored against
    this.takedowns = 0;
    this.spinRate = 0;
    this.sprite.setRotation(Math.PI); // parked nose-west
    this.facing.set(-1, 0);
  }

  // Flat out: no cart penalty, and no speed advantage either.
  speed() {
    return CFG.player.speed;
  }

  handleInput(now) {
    if (!this.alive) {
      this.sprite.body.setVelocity(0, 0);
      return;
    }

    // Spilled it: the moped slews around while the rider picks it back up.
    if (now < this.stunUntil) {
      this.sprite.body.setVelocity(0, 0);
      this.sprite.rotation += this.spinRate * (1 / 60);
      return;
    }

    super.handleInput(now);
  }

  spinOut(now, ms) {
    this.stunUntil = now + ms;
    this.spinRate = Phaser.Math.Between(0, 1) ? CFG.moped.spinSpeed : -CFG.moped.spinSpeed;
    this.sprite.body.setVelocity(0, 0);
  }

  // No cart train to drag — just keep the ring under the wheels.
  updateTrain() {
    this.marker.setPosition(this.x, this.y);
  }
}
