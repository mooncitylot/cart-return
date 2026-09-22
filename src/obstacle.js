// The lot's living hazards: things that move around under their own steam and
// make the shift harder, as opposed to the scenery — parked cars, planters —
// which just sits there and stops you.
//
// The kinds are data in CFG.obstacles.kinds. Adding one means a row there, an
// icon in BootScene.makeObstacle(), and a class registered here under the same
// key. GameScene never names a kind: it spawns what the config lists, ticks
// each one, and asks whether it has caught an attendant.
class Obstacle {
  static register(key, cls) {
    Obstacle.KINDS[key] = cls;
  }

  static def(key) {
    return CFG.obstacles.kinds.find((k) => k.key === key);
  }

  static create(scene, key, x, y) {
    const Kind = Obstacle.KINDS[key];
    const def = Obstacle.def(key);
    return Kind && def ? new Kind(scene, def, x, y) : null;
  }

  constructor(scene, def, x, y) {
    this.scene = scene;
    this.def = def;
    this.key = def.key;
    this.stunUntil = 0;

    this.sprite = scene.physics.add.image(x, y, `obs_${def.key}`).setDepth(7);
    const r = 10;
    this.sprite.body.setCircle(r, this.sprite.width / 2 - r, this.sprite.height / 2 - r);
    this.sprite.setCollideWorldBounds(true);
    // They shoulder their way round the same scenery everyone else does. Held
    // so it can be torn down with the obstacle when the lot is rebuilt.
    this.collider = scene.physics.add.collider(this.sprite, scene.scenery, () =>
      this.blocked(scene.time.now)
    );
  }

  get x() {
    return this.sprite.x;
  }

  get y() {
    return this.sprite.y;
  }

  // Has this caught up with an attendant? Distance rather than a body overlap:
  // it is the same test the moped and the shoppers use, and it is tunable.
  catches(p) {
    if (!this.dangerous()) return false;
    return Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) < this.def.hitRadius;
  }

  // Whether brushing past it costs anything right now.
  dangerous() {
    return true;
  }

  // Knocked away from something, and left standing there for a moment.
  recoil(fromX, fromY, px, stunMs) {
    const a = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
    this.sprite.setPosition(
      Phaser.Math.Clamp(this.x + Math.cos(a) * px, CFG.lot.x1 + 20, CFG.lot.x2 - 20),
      Phaser.Math.Clamp(this.y + Math.sin(a) * px, CFG.sidewalk.y + 16, CFG.lot.y2 - 20)
    );
    this.sprite.body.setVelocity(0, 0);
    this.stunUntil = this.scene.time.now + stunMs;
  }

  // Whether it is actively coming for somebody. The minimap draws that
  // brighter, so a hazard on your tail reads at a glance.
  alerted() {
    return false;
  }

  // Does this stand in front of a stolen forklift, or does the forklift
  // simply drive through it? Anything that doesn't is run over like any
  // other body on the lot — see GameScene.forkliftHazards().
  stopsVehicles() {
    return false;
  }

  // What catching an attendant costs them. The default is a shove: the
  // train everywhere and a moment on the floor. Kinds that do something
  // else override this, so GameScene never has to name one.
  punish(p, now) {
    this.scene.shovedBy(p, this, now);
  }

  update() {}
  blocked() {}
  landedHit() {}

  destroy() {
    if (this.collider) this.collider.destroy();
    this.sprite.destroy();
  }
}

Obstacle.KINDS = {};

// Obstacle one: the coworker who is sore about being left on the tills while
// you get the fresh air. They mooch around the rows until they spot an
// attendant dragging a train, then walk straight through them — no life lost,
// but the carts end up all over the asphalt and you spend a moment picking
// yourself up. An empty-handed attendant is beneath their notice, so the rule
// reads back to the player as: don't get caught out in the open with a full
// train.
class AngryCoworker extends Obstacle {
  constructor(scene, def, x, y) {
    super(scene, def, x, y);

    this.state = 'patrol';
    this.target = null;
    this.until = 0; // when a gloat lapses
    this.calmUntil = 0; // and how long after one before anyone is worth hitting
    this.dodgeUntil = 0;
    this.dodgeSign = 1;
    this.goal = null;
    this.goalBy = 0;

    // Ring under the feet, like the attendants get: dull while they are only
    // sulking, lit while they are coming for you.
    this.marker = scene.add.circle(x, y, 15).setStrokeStyle(2, def.color, 0.4).setDepth(6);
    this.alert = scene.add
      .text(x, y - 24, '!', { fontFamily: 'monospace', fontSize: '18px', color: def.text })
      .setOrigin(0.5)
      .setDepth(9)
      .setVisible(false);
  }

  alerted() {
    return this.state === 'hunt';
  }

  // Only a coworker with their head down does any damage: one who is sulking
  // around the rows, or standing over a spill admiring it, is just somebody in
  // the way. So a shove always follows a charge you were shown coming.
  dangerous() {
    return this.state === 'hunt';
  }

  // Nearest attendant worth the walk: alive, loaded up, and close enough to
  // have been noticed. A shield does not put them off — they find out the hard
  // way, which is the point of carrying one.
  pick(now) {
    if (now < this.calmUntil) return null;
    let best = null;
    this.scene.activeAttendants().forEach((p) => {
      if (p.train.length < this.def.minTrain) return;
      const d = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
      if (d > this.def.aggroRange) return;
      if (!best || d < best.d) best = { p, d };
    });
    return best && best.p;
  }

  // Still worth chasing? They give up on anyone who got away, went down, or
  // has already lost the train they were carrying.
  stillWorthIt() {
    const p = this.target;
    return (
      p &&
      p.alive &&
      p.train.length >= this.def.minTrain &&
      Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) < this.def.loseRange
    );
  }

  update(now) {
    this.marker.setPosition(this.x, this.y);
    this.alert.setPosition(this.x, this.y - 24);

    if (now < this.stunUntil) {
      this.sprite.body.setVelocity(0, 0);
      return;
    }

    if (this.state === 'gloat') {
      this.sprite.body.setVelocity(0, 0);
      if (now < this.until) return;
      this.state = 'patrol';
      this.goal = null;
    }

    if (this.state === 'hunt' && !this.stillWorthIt()) {
      this.target = null;
      this.state = 'patrol';
      this.goal = null;
    }

    if (this.state === 'patrol') {
      const mark = this.pick(now);
      if (mark) {
        this.target = mark;
        this.state = 'hunt';
      }
    }

    const hunting = this.state === 'hunt';
    this.alert.setVisible(hunting);
    this.marker.setStrokeStyle(2, this.def.color, hunting ? 0.95 : 0.4);

    if (hunting) {
      this.walkTo(this.target.x, this.target.y, this.def.chargeSpeed);
      return;
    }
    this.wander(now);
  }

  // A slow circuit of the rows between targets, so they are somewhere in the
  // lot when you next come past rather than parked where they last hit you.
  wander(now) {
    const there =
      this.goal &&
      Phaser.Math.Distance.Between(this.x, this.y, this.goal.x, this.goal.y) < 24;
    if (!this.goal || there) {
      this.goal =
        Math.random() < 0.5 ? this.scene.randomLotPoint() : this.scene.randomWalkPoint();
      this.goalBy = now + 12000; // and never pinned on one for the whole lot
    }
    if (now > this.goalBy) this.goal = null;
    if (this.goal) this.walkTo(this.goal.x, this.goal.y, this.def.speed);
  }

  // Straight at it, except while sidestepping whatever they just walked into.
  walkTo(x, y, speed) {
    const scene = this.scene;
    const now = scene.time.now;
    const fast = speed * scene.speedMul;
    if (now < this.dodgeUntil) {
      const straight = Phaser.Math.Angle.Between(this.x, this.y, x, y);
      const a = straight + (Math.PI / 2) * this.dodgeSign;
      const step = 80;
      scene.physics.moveTo(
        this.sprite,
        this.x + Math.cos(a) * step,
        this.y + Math.sin(a) * step,
        fast
      );
    } else {
      scene.physics.moveTo(this.sprite, x, y, fast);
    }
    this.sprite.setRotation(this.sprite.body.velocity.angle());
  }

  // A parked car or a planter got in the way: slide along it rather than
  // grinding into it until the player walks off.
  blocked(now) {
    if (now < this.dodgeUntil) return;
    this.dodgeUntil = now + this.def.dodgeMs;
    this.dodgeSign = Math.random() < 0.5 ? 1 : -1;
  }

  // Bounced off a shield, or flattened by the moped. Either way the chase is
  // over: they pick themselves up and leave everyone alone for a bit, so a
  // shielded attendant isn't bumped once a second for the rest of the badge.
  recoil(fromX, fromY, px, stunMs) {
    super.recoil(fromX, fromY, px, stunMs);
    this.state = 'patrol';
    this.target = null;
    this.goal = null;
    this.calmUntil = this.scene.time.now + stunMs + this.def.cooldownMs;
  }

  // Landed one. They stop to admire the mess, then leave everyone alone for a
  // bit — otherwise a stunned attendant is hit again before they can move.
  landedHit(now) {
    this.state = 'gloat';
    this.target = null;
    this.until = now + this.def.gloatMs;
    this.calmUntil = now + this.def.gloatMs + this.def.cooldownMs;
    this.sprite.body.setVelocity(0, 0);
  }

  destroy() {
    this.marker.destroy();
    this.alert.destroy();
    super.destroy();
  }
}

Obstacle.register('coworker', AngryCoworker);

// Obstacle two: loss prevention. Nobody's on the lot at the start of a
// shift — the detail is spawned and stood back down off the heat meter
// instead of the level number (GameScene.updateHeat()), so they exist only
// because somebody took the forklift and started putting people on the
// floor.
//
// They differ from a coworker in three ways that matter: they want whoever
// is *wanted* rather than whoever is loaded, they will cross the whole lot
// to get there, and they are the one thing the forklift cannot simply drive
// through. Catching the driver hauls them off it — see GameScene.busted().
class StoreSecurity extends AngryCoworker {
  // A machine that weighs three tonnes does not shrug them aside.
  stopsVehicles() {
    return true;
  }

  // The most wanted attendant on the lot, whatever they happen to be
  // pushing. A clean one is none of their business, which is what makes
  // dumping the forklift and going quiet an actual escape.
  pick(now) {
    if (now < this.calmUntil) return null;
    let best = null;
    this.scene.activeAttendants().forEach((p) => {
      if (p.heat <= 0) return;
      const d = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
      if (!best || d < best.d) best = { p, d };
    });
    return best && best.p;
  }

  stillWorthIt() {
    const p = this.target;
    return p && p.alive && p.heat > 0;
  }

  // A wanted driver who is inside the store is out of reach: the lot is the
  // only floor these have a body on. So they post up at the storefront
  // doors and wait, which is exactly where the run to the cart return has
  // to come back out.
  update(now) {
    const p = this.target;
    if (p && p.zone === 'interior' && now >= this.stunUntil && this.stillWorthIt()) {
      this.marker.setPosition(this.x, this.y);
      this.alert.setPosition(this.x, this.y - 24).setVisible(true);
      this.marker.setStrokeStyle(2, this.def.color, 0.95);
      const door = this.scene.nearestDoor(this.x);
      this.walkTo(door.x, CFG.sidewalk.y + 30, this.def.speed);
      return;
    }
    super.update(now);
  }

  // Not a shove: an arrest. Off the forklift, train on the floor, and the
  // heat goes with it — which is what stands the rest of the detail down.
  punish(p, now) {
    this.scene.busted(p, this, now);
  }
}

Obstacle.register('security', StoreSecurity);
