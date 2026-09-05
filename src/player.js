// One lot attendant. Holds the per-player state that used to live on the scene,
// so solo and two-player runs are the same code path with a different count.
class LotPlayer {
  constructor(scene, index, keySets) {
    this.scene = scene;
    this.index = index;
    this.label = `P${index + 1}`;
    this.keySets = keySets; // each: { up, down, left, right } Phaser Keys
    // Solo starts dead centre of the return zone; two players start either side.
    const offset = scene.playerCount > 1 ? (index === 0 ? -50 : 50) : 0;
    this.spawn = { x: CFG.dropZone.x + offset, y: CFG.player.spawn.y };

    this.tint = index === 0 ? 0x6bd6a5 : 0xf5b45f;
    this.sprite = scene.physics.add
      .image(this.spawn.x, this.spawn.y, `player_${index + 1}`)
      .setDepth(8);
    this.sprite.body.setSize(20, 20).setOffset(4, 2);
    this.sprite.setCollideWorldBounds(true);

    // Ring under the feet: tells you apart from the shoppers at a glance.
    this.marker = scene.add
      .circle(this.spawn.x, this.spawn.y, 15)
      .setStrokeStyle(2, this.tint, 0.85)
      .setDepth(7);

    this.facing = new Phaser.Math.Vector2(0, 1); // pushing away from the store
    this.train = [];
    this.score = 0;
    this.lives = CFG.lives;
    this.alive = true;
    this.stunUntil = 0;
    this.invulnUntil = 0;
  }

  get x() {
    return this.sprite.x;
  }

  get y() {
    return this.sprite.y;
  }

  speed() {
    return Math.max(
      CFG.player.minSpeed,
      CFG.player.speed - this.train.length * CFG.player.speedPerCart
    );
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

  // Carts are pushed: they sit ahead of the player, strung out along the way
  // they are facing, and swing around behind a turn.
  cartTarget(index) {
    const dist = (index + 1) * CFG.cart.spacing + 12;
    return {
      x: Phaser.Math.Clamp(this.x + this.facing.x * dist, 8, CFG.width - 8),
      y: Phaser.Math.Clamp(this.y + this.facing.y * dist, 8, CFG.height - 8),
    };
  }

  updateTrain() {
    this.marker.setPosition(this.x, this.y);
    const angle = this.facing.angle();
    this.train.forEach((cart, i) => {
      const t = this.cartTarget(i);
      cart.sprite.x = Phaser.Math.Linear(cart.sprite.x, t.x, CFG.cart.followLerp);
      cart.sprite.y = Phaser.Math.Linear(cart.sprite.y, t.y, CFG.cart.followLerp);
      cart.sprite.rotation = Phaser.Math.Angle.RotateTo(cart.sprite.rotation, angle, 0.3);
    });
  }

  respawn(now, invulnMs) {
    this.sprite.setPosition(this.spawn.x, this.spawn.y);
    this.marker.setPosition(this.spawn.x, this.spawn.y);
    this.sprite.body.setVelocity(0, 0);
    this.stunUntil = now + 300;
    this.invulnUntil = now + invulnMs;
  }

  eliminate() {
    this.alive = false;
    this.marker.setVisible(false);
    this.sprite.setVisible(false);
    this.sprite.body.setVelocity(0, 0);
    this.sprite.body.enable = false;
  }
}
