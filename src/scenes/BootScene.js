// Generates every sprite procedurally so the game downloads zero assets.
// This is the only file that creates art: swap these for this.load.image()
// calls in a preload() when real sprites exist, keeping the texture keys.
class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    // Players and pedestrians share one drawing, recoloured per person.
    this.makeShopper('player_1', { coat: 0x2f8f74, sleeve: 0x1f6b56, hair: 0x3a2f28 });
    this.makeShopper('player_2', { coat: 0xe08a3c, sleeve: 0xb96c26, hair: 0x2b2118 });
    BootScene.PED_KEYS = [
      { coat: 0x9b6bd6, sleeve: 0x7a4fb0, hair: 0x2b2b33 },
      { coat: 0xd67b6b, sleeve: 0xb05a4a, hair: 0x6b4a2f },
      { coat: 0x6b93d6, sleeve: 0x4a70b0, hair: 0x1f2a35 },
      { coat: 0xd6c46b, sleeve: 0xb0a04a, hair: 0x4a3a22 },
      { coat: 0x8f9aa6, sleeve: 0x6d7783, hair: 0x30343a },
      { coat: 0xb08968, sleeve: 0x8d6c50, hair: 0x241d18 },
    ].map((palette, i) => {
      const key = `ped_${i}`;
      this.makeShopper(key, palette);
      return key;
    });

    this.makeCart();
    this.makeMoped();

    // Parked cars point up (nose-in stalls); traffic points right.
    BootScene.PARKED_KEYS = [0xb44a4a, 0x4a72b4, 0xb49a4a, 0x5aa07a, 0x8a8f96, 0xa86bc4].map(
      (color, i) => {
        const key = `parked_${i}`;
        this.makeParkedCar(key, color);
        return key;
      }
    );

    // Every body style in every colour, so traffic never looks like a convoy.
    const bodies = [
      { name: 'sedan', w: 80, h: 34 },
      { name: 'hatch', w: 70, h: 33 },
      { name: 'suv', w: 96, h: 38 },
      { name: 'van', w: 108, h: 39 },
      { name: 'truck', w: 128, h: 40 },
    ];
    const paints = [0xc95a4f, 0x4f7fc9, 0xd9a441, 0x5aa07a, 0xb0b6bd, 0x8f5ec9, 0xd97ba4, 0x3f4750];
    BootScene.TRAFFIC_KEYS = [];
    bodies.forEach((b) => {
      paints.forEach((color, ci) => {
        const key = `traffic_${b.name}_${ci}`;
        this.makeTrafficCar(key, color, b.w, b.h, b.name);
        BootScene.TRAFFIC_KEYS.push(key);
      });
    });

    this.scene.start('Menu');
  }

  gfx() {
    return this.make.graphics({ x: 0, y: 0, add: false });
  }

  // Person seen from above, facing right (0 rad).
  makeShopper(key, { coat, sleeve, hair }) {
    const w = 28;
    const h = 24;
    const g = this.gfx();

    g.fillStyle(coat, 1);
    g.fillRoundedRect(2, 3, w - 8, h - 6, 7);
    g.fillStyle(sleeve, 1); // arms out front
    g.fillRect(w - 12, 2, 10, 5);
    g.fillRect(w - 12, h - 7, 10, 5);
    g.fillStyle(0xf0d9b5, 1); // head
    g.fillCircle(w - 11, h / 2, 6.5);
    g.fillStyle(hair, 1); // hair sits behind the face, so facing reads
    g.fillCircle(w - 14, h / 2, 5);

    g.generateTexture(key, w, h);
    g.destroy();
  }

  // Cart seen from above, handle end trailing left.
  makeCart() {
    const w = 26;
    const h = 20;
    const g = this.gfx();

    g.fillStyle(0xd8dee6, 1);
    g.fillRoundedRect(0, 1, w - 3, h - 2, 4);
    g.lineStyle(1, 0x8d97a3, 1);
    g.strokeRoundedRect(0, 1, w - 3, h - 2, 4);
    for (let i = 1; i < 4; i++) {
      const x = (w - 3) * (i / 4);
      g.lineBetween(x, 3, x, h - 3);
    }
    g.lineStyle(2, 0xaeb7c2, 1); // handle
    g.lineBetween(1, 4, 1, h - 4);

    g.generateTexture('cart', w, h);
    g.destroy();
  }

  // The versus-mode moped, seen from above with its rider: small enough to
  // thread the aisles, loud enough not to be mistaken for traffic.
  makeMoped() {
    const w = 46;
    const h = 26;
    const mid = h / 2;
    const g = this.gfx();

    // wheels, front and back along the centre line
    g.fillStyle(0x2a2f36, 1);
    g.fillRoundedRect(0, mid - 4, 12, 8, 3);
    g.fillRoundedRect(w - 12, mid - 4, 12, 8, 3);
    g.fillStyle(0x8d97a3, 1);
    g.fillRect(4, mid - 1, 4, 2);
    g.fillRect(w - 8, mid - 1, 4, 2);

    // deck: bright, and long enough to show past the rider at both ends
    g.fillStyle(0xd4356b, 1);
    g.fillRoundedRect(5, mid - 7, w - 10, 14, 6);
    g.fillStyle(0x8f1f45, 1); // seat
    g.fillRoundedRect(9, mid - 5, 13, 10, 4);

    // handlebars across the nose
    g.fillStyle(0xb9c2cd, 1);
    g.fillRect(w - 17, 2, 4, h - 4);

    // rider: pale jacket so the silhouette pops against the asphalt
    g.fillStyle(0xe7edf4, 1);
    g.fillRoundedRect(15, 5, 16, h - 10, 6);
    g.fillStyle(0xc2ccd8, 1); // arms out to the bars
    g.fillRect(28, 4, 8, 4);
    g.fillRect(28, h - 8, 8, 4);
    g.fillStyle(0xe8b13c, 1); // helmet
    g.fillCircle(30, mid, 6.5);
    g.fillStyle(0x1b2027, 1); // visor, pointing the way it travels
    g.fillRect(32, mid - 4, 4, 8);

    g.generateTexture('moped', w, h);
    g.destroy();
  }

  makeParkedCar(key, color) {
    const w = 36;
    const h = 62;
    const g = this.gfx();

    g.fillStyle(color, 1);
    g.fillRoundedRect(1, 0, w - 2, h, 7);
    g.fillStyle(0x121820, 0.5); // windshield + rear glass
    g.fillRoundedRect(6, 8, w - 12, 14, 3);
    g.fillRoundedRect(6, h - 24, w - 12, 15, 3);
    g.fillStyle(0x000000, 0.18); // roof
    g.fillRect(6, 26, w - 12, h - 52);
    g.fillStyle(0x15181c, 1); // tyres
    [10, h - 22].forEach((y) => {
      g.fillRect(-1, y, 4, 12);
      g.fillRect(w - 3, y, 4, 12);
    });

    g.generateTexture(key, w, h);
    g.destroy();
  }

  makeTrafficCar(key, color, w, h, style) {
    const g = this.gfx();

    g.fillStyle(color, 1);
    g.fillRoundedRect(0, 0, w, h, style === 'truck' || style === 'van' ? 5 : 8);

    if (style === 'truck') {
      // cab up front, flat box behind
      g.fillStyle(0x000000, 0.22);
      g.fillRect(0, 2, w * 0.6, h - 4);
      g.fillStyle(0x121820, 0.55);
      g.fillRoundedRect(w * 0.72, h * 0.16, w * 0.2, h * 0.68, 3);
    } else if (style === 'van') {
      g.fillStyle(0x000000, 0.16);
      g.fillRect(0, 3, w * 0.5, h - 6);
      g.fillStyle(0x121820, 0.5);
      g.fillRoundedRect(w * 0.66, h * 0.16, w * 0.24, h * 0.68, 3);
      g.fillRoundedRect(w * 0.42, h * 0.18, w * 0.18, h * 0.64, 3);
    } else {
      g.fillStyle(0x121820, 0.5);
      g.fillRoundedRect(w * 0.5, h * 0.18, w * 0.28, h * 0.64, 3);
      g.fillRoundedRect(w * 0.2, h * 0.18, w * 0.24, h * 0.64, 3);
    }

    g.fillStyle(0x15181c, 1); // tyres
    [w * 0.14, w * 0.68].forEach((x) => {
      g.fillRect(x, -3, w * 0.16, 5);
      g.fillRect(x, h - 2, w * 0.16, 5);
    });
    g.fillStyle(0xffe9a8, 1); // headlights mark the front
    g.fillRect(w - 4, h * 0.2, 4, h * 0.16);
    g.fillRect(w - 4, h * 0.64, 4, h * 0.16);

    g.generateTexture(key, w, h);
    g.destroy();
  }
}
