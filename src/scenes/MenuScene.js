// Mode select. Sets the player count, then hands off to the game.
class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const cx = CFG.width / 2;
    const cy = (CFG.height + CFG.hudHeight) / 2;

    this.add.rectangle(cx, cy, CFG.width, CFG.height + CFG.hudHeight, 0x161a20);
    this.add
      .text(cx, cy - 150, 'CART RETURN', {
        fontFamily: 'monospace',
        fontSize: '52px',
        color: '#e8eef5',
      })
      .setOrigin(0.5);
    this.add
      .text(cx, cy - 104, 'clear the lot before closing time', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#8a97a6',
      })
      .setOrigin(0.5);

    this.option(cx, cy - 40, '1', 'ONE PLAYER', 'arrows or WASD', 'solo');
    this.option(cx, cy + 40, '2', 'TWO PLAYER', 'co-op: P1 arrows · P2 WASD', 'coop');
    this.option(cx, cy + 120, '3', 'VERSUS', 'attendant arrows · moped WASD', 'versus');

    this.add
      .text(cx, cy + 184, 'press 1, 2 or 3', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#6fa8d4',
      })
      .setOrigin(0.5);

    const bind = (keyName, mode) => {
      this.input.keyboard.on(`keydown-${keyName}`, () => this.start(mode));
    };
    bind('ONE', 'solo');
    bind('TWO', 'coop');
    bind('THREE', 'versus');
    bind('NUMPAD_ONE', 'solo');
    bind('NUMPAD_TWO', 'coop');
    bind('NUMPAD_THREE', 'versus');
  }

  option(cx, y, key, title, hint, mode) {
    const box = this.add
      .rectangle(cx, y, 500, 68, 0x1f242b)
      .setStrokeStyle(2, 0x3a4550)
      .setInteractive({ useHandCursor: true });
    box.on('pointerover', () => box.setStrokeStyle(2, 0x6fa8d4));
    box.on('pointerout', () => box.setStrokeStyle(2, 0x3a4550));
    box.on('pointerup', () => this.start(mode));

    this.add
      .text(cx - 220, y, key, { fontFamily: 'monospace', fontSize: '30px', color: '#6fa8d4' })
      .setOrigin(0.5);
    this.add
      .text(cx - 180, y - 11, title, {
        fontFamily: 'monospace',
        fontSize: '19px',
        color: '#e8eef5',
      })
      .setOrigin(0, 0.5);
    this.add
      .text(cx - 180, y + 12, hint, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#8a97a6',
      })
      .setOrigin(0, 0.5);

    // A little cast shot of who is playing.
    this.add.image(cx + 196, y, 'player_1').setRotation(-Math.PI / 2).setScale(1.5);
    if (mode === 'coop') {
      this.add.image(cx + 152, y, 'player_2').setRotation(-Math.PI / 2).setScale(1.5);
    } else if (mode === 'versus') {
      this.add.image(cx + 140, y, 'moped').setScale(1.1);
    }
  }

  start(mode) {
    this.registry.set('mode', mode);
    this.scene.start('Game');
    this.scene.launch('Hud');
  }
}
