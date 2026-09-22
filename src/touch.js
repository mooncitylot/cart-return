// Touch controls for phones and tablets: an on-screen stick per player, plus
// the restart/menu keys a hardware keyboard would otherwise cover.
//
// The sticks are DOM elements laid over the canvas rather than sprites drawn
// inside it. Phaser scales the canvas to fit the page, so an in-scene stick
// would shrink with the lot on a phone; an overlay stays thumb-sized whatever
// the canvas is doing, and it costs the game loop nothing.
//
// Each stick is analogue: the further it is pushed, the faster the attendant
// walks, and the scene reads it through the same path as the arrow keys.
const TouchControls = {
  active: false, // an overlay exists and this device wants it
  root: null,
  sticks: [],
  buttons: null,
  actions: {},

  // Coarse pointer or a real touchscreen. `?touch=1` forces it on for testing
  // on a desktop, `?touch=0` off for a laptop with a touchscreen it never uses.
  supported() {
    const forced = new URLSearchParams(location.search).get('touch');
    if (forced === '1') return true;
    if (forced === '0') return false;
    return (
      (navigator.maxTouchPoints || 0) > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    );
  },

  // Builds the overlay inside the element Phaser rendered the canvas into.
  init(parent) {
    if (this.root || !this.supported() || !parent) return;

    this.root = document.createElement('div');
    this.root.id = 'touch';

    this.sticks = [this.makeStick('left'), this.makeStick('right')];
    this.sticks.forEach((s) => this.root.appendChild(s.zone));

    // Portrait is a poor fit for a landscape lot; the stylesheet only shows
    // this when the device is held that way.
    this.rotateNote = document.createElement('div');
    this.rotateNote.className = 'touch-rotate';
    this.rotateNote.textContent = 'turn sideways for a bigger lot';
    this.root.appendChild(this.rotateNote);

    this.buttons = document.createElement('div');
    this.buttons.className = 'touch-buttons';
    this.buttons.appendChild(this.makeButton('use', '🚜', 'get on or off the forklift'));
    this.buttons.appendChild(this.makeButton('restart', '↺', 'restart'));
    this.buttons.appendChild(this.makeButton('menu', '☰', 'menu'));
    this.root.appendChild(this.buttons);

    parent.appendChild(this.root);
    // The stylesheet sizes the canvas off this in landscape, where the screen
    // is wider than the lot and the fit has to come from the height.
    document.documentElement.style.setProperty(
      '--game-aspect',
      `${CFG.view.w / (CFG.view.h + CFG.hudHeight)}`
    );
    document.body.classList.add('touch');
    this.active = true;
    this.setLayout(0);
    this.track(parent);
  },

  // Phaser stretches its parent div to fill the page and then letterboxes the
  // canvas inside it, so the overlay is pinned to the canvas rather than to the
  // parent — otherwise the sticks drift off the lot when the device rotates.
  track(parent) {
    const sync = () => {
      const canvas = parent.querySelector('canvas');
      if (!canvas) return;
      const p = parent.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      this.root.style.left = `${c.left - p.left}px`;
      this.root.style.top = `${c.top - p.top}px`;
      this.root.style.width = `${c.width}px`;
      this.root.style.height = `${c.height}px`;
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    // A call, a notification or a swipe away takes the finger with it.
    window.addEventListener('blur', () => this.reset());
    if (window.ResizeObserver) {
      const canvas = parent.querySelector('canvas');
      if (canvas) new ResizeObserver(sync).observe(canvas);
      new ResizeObserver(sync).observe(parent);
    }
  },

  // Handles are handed out whether or not the overlay exists, so the scene
  // wires them up the same way on a desktop — they simply read zero there.
  stick(index) {
    return this.sticks[index] || ZERO_STICK;
  },

  // `count` sticks visible, labelled for whoever is driving them.
  setLayout(count, labels = []) {
    if (!this.active) return;
    this.sticks.forEach((s, i) => {
      const on = i < count;
      s.zone.classList.toggle('on', on);
      s.label.textContent = labels[i] || '';
      if (!on) s.release();
    });
  },

  // Which on-screen buttons to show, and what they do. Passing nothing hides
  // the lot: the menu has no use for them.
  setActions(actions) {
    this.actions = actions || {};
    if (!this.active) return;
    Array.from(this.buttons.children).forEach((b) => {
      b.classList.toggle('on', !!this.actions[b.dataset.action]);
    });
  },

  // Called when a scene tears down mid-push, so nobody walks off on a stick
  // that no longer has a finger on it.
  reset() {
    this.sticks.forEach((s) => s.release());
  },

  makeButton(action, glyph, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'touch-btn';
    b.dataset.action = action;
    b.textContent = glyph;
    b.setAttribute('aria-label', title);
    b.addEventListener('pointerup', (e) => {
      e.preventDefault();
      const fn = this.actions[action];
      if (fn) fn();
    });
    return b;
  },

  makeStick(side) {
    const zone = document.createElement('div');
    zone.className = `stick-zone ${side}`;
    const base = document.createElement('div');
    base.className = 'stick-base';
    const thumb = document.createElement('div');
    thumb.className = 'stick-thumb';
    const label = document.createElement('div');
    label.className = 'stick-label';
    base.appendChild(thumb);
    zone.appendChild(base);
    zone.appendChild(label);

    const stick = {
      zone,
      base,
      thumb,
      label,
      id: null, // the pointer that owns it, so two thumbs never fight
      x: 0,
      y: 0,
      cx: 0,
      cy: 0,
      radius: 1,
      vector() {
        return { x: this.x, y: this.y };
      },
      release() {
        if (this.id !== null && zone.hasPointerCapture(this.id)) {
          zone.releasePointerCapture(this.id);
        }
        this.id = null;
        this.x = 0;
        this.y = 0;
        zone.classList.remove('active');
        base.style.left = '';
        base.style.top = '';
        thumb.style.transform = '';
      },
    };

    // The base is parked in the middle of its corner but jumps to wherever the
    // thumb lands, so you never have to look down to find it.
    const grab = (e) => {
      if (stick.id !== null) return;
      const r = zone.getBoundingClientRect();
      const rad = base.offsetWidth / 2 || r.width / 2;
      stick.id = e.pointerId;
      stick.radius = rad;
      stick.cx = Phaser.Math.Clamp(e.clientX - r.left, rad, r.width - rad);
      stick.cy = Phaser.Math.Clamp(e.clientY - r.top, rad, r.height - rad);
      base.style.left = `${stick.cx}px`;
      base.style.top = `${stick.cy}px`;
      zone.classList.add('active');
      zone.setPointerCapture(e.pointerId);
      drag(e);
    };

    const drag = (e) => {
      if (e.pointerId !== stick.id) return;
      e.preventDefault();
      const r = zone.getBoundingClientRect();
      let dx = (e.clientX - r.left - stick.cx) / stick.radius;
      let dy = (e.clientY - r.top - stick.cy) / stick.radius;
      let len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
        len = 1;
      }
      thumb.style.transform = `translate(calc(-50% + ${dx * stick.radius}px), calc(-50% + ${
        dy * stick.radius
      }px))`;
      // Dead zone, with what is left rescaled to a full 0..1 push, so a resting
      // thumb reads as still and a half push is still half speed.
      if (len < TouchControls.DEAD) {
        stick.x = 0;
        stick.y = 0;
        return;
      }
      const k = (len - TouchControls.DEAD) / (1 - TouchControls.DEAD) / len;
      stick.x = dx * k;
      stick.y = dy * k;
    };

    const drop = (e) => {
      if (e.pointerId !== stick.id) return;
      e.preventDefault();
      stick.release();
    };

    zone.addEventListener('pointerdown', grab);
    zone.addEventListener('pointermove', drag);
    zone.addEventListener('pointerup', drop);
    zone.addEventListener('pointercancel', drop);
    zone.addEventListener('lostpointercapture', drop);
    // Long press on a canvas game is never a text selection.
    zone.addEventListener('contextmenu', (e) => e.preventDefault());

    return stick;
  },

  DEAD: 0.18, // deflection under this reads as a resting thumb
};

// Stand-in for a stick that was never built, so callers need no null checks.
const ZERO_STICK = {
  vector() {
    return { x: 0, y: 0 };
  },
  release() {},
};
