// Status band under the lot, and the end-of-shift card over it. Reads whatever
// GameScene publishes to the registry.
//
// The end card lives here rather than in GameScene because this camera is
// unzoomed and covers the whole canvas: the same code centres it correctly in
// solo and in the two-player split screen.
class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud');
  }

  create() {
    const V = CFG.view;
    const y = V.h + CFG.hudHeight / 2;

    this.add.rectangle(V.w / 2, y, V.w, CFG.hudHeight, 0x0e1116).setOrigin(0.5);

    const mono = { fontFamily: 'monospace', fontSize: '13px' };
    this.p1 = this.add.text(12, y, '', { ...mono, color: '#7fd6a6' }).setOrigin(0, 0.5);
    this.middle = this.add.text(V.w / 2, y, '', { ...mono, color: '#8a97a6' }).setOrigin(0.5);
    this.p2 = this.add
      .text(V.w - 12, y, '', { ...mono, color: '#e0a35c' })
      .setOrigin(1, 0.5);
    this.p2Color = { attendant: '#e0a35c', driver: '#ef8fae' };

    this.add.rectangle(V.w / 2, V.h + 2, V.w, 4, 0x2a3038).setOrigin(0.5, 0);
    this.timerBar = this.add.rectangle(0, V.h + 2, V.w, 4, 0x6fa8d4).setOrigin(0, 0);

    this.endCard = [];

    // Registry listeners outlive the scene, so drop them on shutdown — otherwise
    // a publish after the HUD stops calls setText on destroyed objects.
    const onHud = (_parent, data) => this.render(data);
    const onEnd = (_parent, data) => this.renderEndCard(data);
    this.registry.events.on('changedata-hud', onHud);
    this.registry.events.on('setdata-hud', onHud);
    this.registry.events.on('changedata-gameover', onEnd);
    this.registry.events.on('setdata-gameover', onEnd);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.registry.events.off('changedata-hud', onHud);
      this.registry.events.off('setdata-hud', onHud);
      this.registry.events.off('changedata-gameover', onEnd);
      this.registry.events.off('setdata-gameover', onEnd);
    });

    this.render(this.registry.get('hud'));
    this.renderEndCard(this.registry.get('gameover'));
  }

  // How wanted somebody is, as filled and empty stars. Nothing at all while
  // they are clean, so the line only grows once there is something to say.
  heatMeter(p, maxStars) {
    if (!p.stars) return '';
    return `   ${'★'.repeat(p.stars)}${'☆'.repeat(Math.max(0, maxStars - p.stars))}`;
  }

  playerLine(p, maxTrain, maxStars) {
    const score = `${p.label} ${String(Math.max(0, p.score)).padStart(6, '0')}`;
    if (p.kind === 'driver') {
      return `${score}   TAKEDOWNS ${p.takedowns}`;
    }
    if (!p.alive) return `${score}   OUT`;
    // Running power-ups, each with the seconds it has left, in config order.
    const power = (p.effects || [])
      .map((e) => `${e.label} ${Math.ceil(e.left / 1000)}s`)
      .join(' ');
    // On the forklift the cap stops being a number worth reading — the
    // forks take whatever is in front of them — so it reads as one.
    const cap = p.driving ? '∞' : p.maxTrain || maxTrain;
    let line = `${score}   ${'♥'.repeat(p.lives)}   ${
      p.driving ? 'TOWING' : 'PUSHING'
    } ${p.train}/${cap}`;
    if (p.zone === 'interior') line += '   IN STORE';
    line += this.heatMeter(p, maxStars);
    return power ? `${line}   ${power}` : line;
  }

  render(d) {
    if (!d || !this.scene.isActive()) return;

    const stars = d.maxStars || 0;
    this.p1.setText(this.playerLine(d.players[0], d.maxTrain, stars));
    const second = d.players[1];
    this.p2.setText(second ? this.playerLine(second, d.maxTrain, stars) : '');
    if (second) this.p2.setColor(this.p2Color[second.kind]);
    // A progress figure, not a headcount: the store keeps restocking the
    // corrals, so what matters is how much of the quota is handed over.
    const quota = d.quota || d.left;
    this.middle.setText(
      `LOT ${d.level}   RETURNED ${quota - d.left}/${quota}   ${Math.ceil(d.time)}s`
    );

    const frac = Phaser.Math.Clamp(d.time / CFG.levelSeconds, 0, 1);
    this.timerBar.width = CFG.view.w * frac;
    this.timerBar.fillColor = frac < 0.2 ? 0xc94f4f : frac < 0.45 ? 0xd9a441 : 0x6fa8d4;
  }

  // Cleared and rebuilt on every change, so restarting the lot wipes the card.
  renderEndCard(d) {
    this.endCard.forEach((o) => o.destroy());
    this.endCard = [];
    if (!d || !this.scene.isActive()) return;

    const V = CFG.view;
    const cx = V.w / 2;
    const cy = V.h / 2;
    const text = (y, str, size, color) =>
      this.endCard.push(
        this.add
          .text(cx, y, str, { fontFamily: 'monospace', fontSize: size, color })
          .setOrigin(0.5)
          .setDepth(21)
      );

    this.endCard.push(
      this.add.rectangle(cx, cy, V.w, 210, 0x05070a).setAlpha(0.92).setDepth(20)
    );
    text(cy - 50, d.headline, '34px', '#e8eef5');
    text(cy - 6, d.scores, '17px', '#cbd6e2');
    if (d.verdict) text(cy + 26, d.verdict, '15px', '#7fd6a6');
    const again = TouchControls.active ? '↺ restart  ·  ☰ menu' : 'R restart  ·  M menu';
    text(cy + 62, again, '14px', '#8a97a6');
  }
}
