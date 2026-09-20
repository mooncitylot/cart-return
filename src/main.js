const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CFG.view.w,
  height: CFG.view.h + CFG.hudHeight,
  backgroundColor: '#0e1116',
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
  },
  scene: [BootScene, MenuScene, GameScene, HudScene],
});
