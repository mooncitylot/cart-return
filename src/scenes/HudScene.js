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
    this.p2Color = { attendant: '#e0a35c', driver: '#ef8fae' };

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
    const score = `${p.label} ${String(Math.max(0, p.score)).padStart(6, '0')}`;
    if (p.kind === 'driver') {
      return `${score}   TAKEDOWNS ${p.takedowns}`;
    }
    if (!p.alive) return `${score}   OUT`;
    return `${score}   ${'♥'.repeat(p.lives)}   PUSHING ${p.train}/${maxTrain}`;
  }

  render(d) {
    if (!d || !this.scene.isActive()) return;

    this.p1.setText(this.playerLine(d.players[0], d.maxTrain));
    const second = d.players[1];
    this.p2.setText(second ? this.playerLine(second, d.maxTrain) : '');
    if (second) this.p2.setColor(this.p2Color[second.kind]);
    this.middle.setText(`LOT ${d.level}   CARTS LEFT ${d.left}   ${Math.ceil(d.time)}s`);

    const frac = Phaser.Math.Clamp(d.time / CFG.levelSeconds, 0, 1);
    this.timerBar.width = CFG.width * frac;
    this.timerBar.fillColor = frac < 0.2 ? 0xc94f4f : frac < 0.45 ? 0xd9a441 : 0x6fa8d4;
  }
}
