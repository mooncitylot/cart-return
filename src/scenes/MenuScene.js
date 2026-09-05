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

    this.option(cx, cy - 20, '1', 'ONE PLAYER', 'arrows or WASD', 'player_1');
    this.option(cx, cy + 70, '2', 'TWO PLAYER', 'P1 arrows · P2 WASD', 'player_2');

    this.add
      .text(cx, cy + 168, 'press 1 or 2', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#6fa8d4',
      })
      .setOrigin(0.5);

    this.input.keyboard.on('keydown-ONE', () => this.start(1));
    this.input.keyboard.on('keydown-TWO', () => this.start(2));
    this.input.keyboard.on('keydown-NUMPAD_ONE', () => this.start(1));
    this.input.keyboard.on('keydown-NUMPAD_TWO', () => this.start(2));
  }

  option(cx, y, key, title, hint, texture) {
    const box = this.add
      .rectangle(cx, y, 460, 68, 0x1f242b)
      .setStrokeStyle(2, 0x3a4550)
      .setInteractive({ useHandCursor: true });
    box.on('pointerover', () => box.setStrokeStyle(2, 0x6fa8d4));
    box.on('pointerout', () => box.setStrokeStyle(2, 0x3a4550));
    box.on('pointerup', () => this.start(Number(key)));

    this.add
      .text(cx - 200, y, key, { fontFamily: 'monospace', fontSize: '30px', color: '#6fa8d4' })
      .setOrigin(0.5);
    this.add
      .text(cx - 150, y - 11, title, {
        fontFamily: 'monospace',
        fontSize: '19px',
        color: '#e8eef5',
      })
      .setOrigin(0, 0.5);
    this.add
      .text(cx - 150, y + 12, hint, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#8a97a6',
      })
      .setOrigin(0, 0.5);

    // A little cast shot of who you are playing.
    this.add.image(cx + 176, y, texture).setRotation(-Math.PI / 2).setScale(1.6);
    if (key === '2') {
      this.add.image(cx + 140, y, 'player_1').setRotation(-Math.PI / 2).setScale(1.6);
    }
  }

  start(playerCount) {
    this.registry.set('playerCount', playerCount);
    this.scene.start('Game');
    this.scene.launch('Hud');
  }
}
