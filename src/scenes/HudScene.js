// Status band under the lot. Reads whatever GameScene publishes to the registry.
class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud');
  }

  create() {
    const y = CFG.height + CFG.hudHeight / 2;

    this.add.rectangle(CFG.width / 2, y, CFG.width, CFG.hudHeight, 0x0e1116).setOrigin(0.5);

    const mono = { fontFamily: 'monospace', fontSize: '13px' };
    this.p1 = this.add.text(12, y, '', { ...mono, color: '#7fd6a6' }).setOrigin(0, 0.5);
    this.middle = this.add
      .text(CFG.width / 2, y, '', { ...mono, color: '#8a97a6' })
      .setOrigin(0.5);
    this.p2 = this.add
      .text(CFG.width - 12, y, '', { ...mono, color: '#e0a35c' })
      .setOrigin(1, 0.5);

    this.add
      .rectangle(CFG.width / 2, CFG.height + 2, CFG.width, 4, 0x2a3038)
      .setOrigin(0.5, 0);
    this.timerBar = this.add
      .rectangle(0, CFG.height + 2, CFG.width, 4, 0x6fa8d4)
      .setOrigin(0, 0);

    // Registry listeners outlive the scene, so drop them on shutdown — otherwise
    // a publish after the HUD stops calls setText on destroyed objects.
    const onHud = (_parent, data) => this.render(data);
    this.registry.events.on('changedata-hud', onHud);
    this.registry.events.on('setdata-hud', onHud);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.registry.events.off('changedata-hud', onHud);
      this.registry.events.off('setdata-hud', onHud);
    });

    this.render(this.registry.get('hud'));
  }

  playerLine(p, maxTrain) {
    if (!p.alive) return `${p.label} ${String(p.score).padStart(6, '0')}   OUT`;
    return `${p.label} ${String(p.score).padStart(6, '0')}   ${'♥'.repeat(p.lives)}   PUSHING ${p.train}/${maxTrain}`;
  }

  render(d) {
    if (!d || !this.scene.isActive()) return;

    this.p1.setText(this.playerLine(d.players[0], d.maxTrain));
    this.p2.setText(d.players[1] ? this.playerLine(d.players[1], d.maxTrain) : '');
    this.middle.setText(`LOT ${d.level}   CARTS LEFT ${d.left}   ${Math.ceil(d.time)}s`);

    const frac = Phaser.Math.Clamp(d.time / CFG.levelSeconds, 0, 1);
    this.timerBar.width = CFG.width * frac;
    this.timerBar.fillColor = frac < 0.2 ? 0xc94f4f : frac < 0.45 ? 0xd9a441 : 0x6fa8d4;
  }
}
