// The forklift off the receiving dock. It is not part of anybody's job: it
// sits on the receiving floor with the key in it, and an attendant who walks
// up to it and presses the use key is stealing it.
//
// What it changes:
//   * the train stops mattering — it tows CFG.forklift.maxTrain of them and
//     pays no per-cart speed penalty, so a whole corral goes back in one run
//   * it sweeps carts up at a wider radius instead of nosing each one
//   * traffic stalls it rather than flattening the driver
//   * anything on foot it touches goes on the floor, which is the whole
//     reason the front office starts sending security out
//
// It is deliberately NOT a second player class. The rider keeps their own
// Arcade body and their own cart train, and this only takes over how that
// body is steered, so every other system in the scene — the camera, the
// zone clamp, pickups, the drop zone, the minimap — goes on reading the
// attendant it already knows about and needs no forklift case at all. The
// body stays the attendant's 10px circle too, so the forklift threads the
// same doorways and aisles its driver does.
class Forklift {
  constructor(scene, at) {
    this.scene = scene;
    this.rider = null;
    this.stolen = false; // the first theft is the one worth points
    this.heading = -Math.PI / 2; // parked nose-out, facing the roll-up doors
    this.speed = 0;
    // Which floor it is standing on, so nobody mounts it through a wall.
    // It starts inside, on the receiving floor behind the trailer dock.
    this.zone = 'interior';

    this.sprite = scene.add
      .image(at.x, at.y, 'forklift')
      .setDepth(7)
      .setRotation(this.heading);
    // Amber beacon on the back of the overhead guard. It ticks over slowly
    // while the thing is parked — which is what tells you it is a machine
    // you can take, not scenery — and hammers while somebody is driving it.
    // Kept behind the operator so it never sits on top of them.
    this.beacon = scene.add.circle(at.x, at.y, 5, 0xf2b338, 0.9).setDepth(8);
  }

  get x() {
    return this.sprite.x;
  }

  get y() {
    return this.sprite.y;
  }

  // Close enough to climb on, and on the same floor. A rider already on it
  // is the only thing that makes it unavailable — there is one forklift and
  // in co-op that is the point.
  reachableBy(p) {
    return (
      !this.rider &&
      p.alive &&
      p.canPushCarts &&
      p.zone === this.zone &&
      Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) < CFG.forklift.mountRadius
    );
  }

  mount(p) {
    this.rider = p;
    p.forklift = this;
    this.speed = 0;
    this.heading = p.facing.angle();
    // The attendant is on the forklift now, not beside it: their sprite goes
    // away and this one stands in for it. The marker ring stays, so the
    // player still reads as themselves on a busy lot.
    p.sprite.setVisible(false);
    p.trail.length = 0; // no cart yanked across the lot from where they stood
  }

  // Stepped off, or hauled off. The forklift stays exactly where it stopped,
  // which is what makes abandoning it a real choice: anybody can take it.
  dismount() {
    const p = this.rider;
    if (!p) return null;
    this.rider = null;
    p.forklift = null;
    p.sprite.setVisible(true);
    p.sprite.body.setVelocity(0, 0);
    this.speed = 0;
    this.zone = p.zone;
    this.sprite.setPosition(p.x, p.y).setRotation(this.heading);
    return p;
  }

  // Three tonnes of counterweight: it winds up to speed, sheds it faster
  // than it gains it, and swings round onto a new heading at a fixed rate
  // rather than snapping to the stick. Everything else on the lot moves the
  // instant you ask it to; this is the one thing that does not, and that is
  // most of what makes driving it feel like driving something.
  drive(v, dt) {
    const p = this.rider;
    const F = CFG.forklift;
    const push = Math.min(v.length(), 1);
    const want = push * F.topSpeed;
    const rate = want > this.speed ? F.accel : F.brake;
    this.speed += Phaser.Math.Clamp(want - this.speed, -rate * dt, rate * dt);

    if (push > 0.001) {
      this.heading = Phaser.Math.Angle.RotateTo(this.heading, v.angle(), F.turnRate * dt);
    }
    p.facing.set(Math.cos(this.heading), Math.sin(this.heading));
    p.sprite.body.setVelocity(
      Math.cos(this.heading) * this.speed,
      Math.sin(this.heading) * this.speed
    );
    p.sprite.setRotation(this.heading);
  }

  // Killed on the spot — clipped by traffic, or dropped when the driver is
  // stunned. The heading is kept: it is still pointing where it was pointing.
  stall() {
    this.speed = 0;
    if (this.rider) this.rider.sprite.body.setVelocity(0, 0);
  }

  // Follows its rider's body, which is the thing the physics actually moves.
  update(now) {
    const p = this.rider;
    if (p) this.sprite.setPosition(p.x, p.y).setRotation(this.heading);
    // The beacon rides the machine, so its offset turns with the heading.
    const back = CFG.forklift.beaconOffset;
    this.beacon.setPosition(
      this.sprite.x - Math.cos(this.heading) * back,
      this.sprite.y - Math.sin(this.heading) * back
    );
    const period = p ? CFG.forklift.beaconMs / 2 : CFG.forklift.beaconMs;
    this.beacon.setAlpha(Math.floor(now / period) % 2 ? 0.25 : 0.9);
    // Parked inside, it is under the store roof like everything else in
    // there; parked out on the lot it sits with the carts.
    this.beacon.setDepth(p ? 9 : 8);
  }

  // Back on the dock for a fresh lot, with nobody on it.
  reset() {
    this.dismount();
    this.stolen = false;
    this.zone = 'interior';
    this.heading = -Math.PI / 2;
    this.sprite.setPosition(CFG.forklift.spawn.x, CFG.forklift.spawn.y).setRotation(this.heading);
  }
}
