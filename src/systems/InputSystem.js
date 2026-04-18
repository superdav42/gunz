/**
 * Unified input: keyboard + virtual joystick (touch) + mouse/touch aim + fire.
 *
 * Mobile layout:
 *   Left side: virtual joystick (move)
 *   Right side: tap/drag to aim turret, fire button
 */
export class InputSystem {
  constructor(canvas) {
    this.canvas = canvas;

    // Keyboard state
    this._keys = {};

    // Touch joystick state
    this._joystick = { active: false, id: null, startX: 0, startY: 0, dx: 0, dy: 0 };
    this._aimTouch = { active: false, id: null, x: 0, y: 0 };
    this._fireRequested   = false;
    this._meleeRequested  = false;
    this._reloadRequested = false;
    /** One-shot: true on the frame Q is pressed (activate ability). */
    this._abilityRequested = false;
    this._turretAngle = null;
    /** One-shot: true on the frame E is pressed (exit/enter vehicle). */
    this._exitVehicleRequested = false;
    /** One-shot: true on the frame 1 is pressed — switch to gun slot (t034). */
    this._switchToGunRequested   = false;
    /** One-shot: true on the frame 2 is pressed — switch to melee slot (t034). */
    this._switchToMeleeRequested = false;

    // Mouse aim
    this._mouseAim = { active: false, x: 0, y: 0 };

    this._bindKeyboard();
    this._bindTouch();
    this._bindMouse();
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
      if (e.code === 'Space') this._fireRequested = true;
      if (e.code === 'KeyE')  this._exitVehicleRequested = true;
      // F key — on-foot melee attack (VISION.md "Controls" table)
      if (e.code === 'KeyF') this._meleeRequested = true;
      // R key — manual reload for on-foot gun (t030)
      if (e.code === 'KeyR') this._reloadRequested = true;
      // 1/2 — weapon slot switching: 1 = gun, 2 = melee (t034)
      if (e.code === 'Digit1') this._switchToGunRequested   = true;
      if (e.code === 'Digit2') this._switchToMeleeRequested = true;
      // Q key — activate ability (tank ability in tank mode, weapon ability in soldier mode) (t042)
      if (e.code === 'KeyQ') this._abilityRequested = true;
      // Prevent Tab from shifting browser focus while held for the scoreboard
      if (e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this._keys[e.code] = false;
    });
  }

  _bindMouse() {
    this.canvas.addEventListener('mousemove', (e) => {
      this._mouseAim.active = true;
      this._mouseAim.x = e.clientX;
      this._mouseAim.y = e.clientY;
      this._turretAngle = this._screenToAngle(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this._fireRequested = true;
      // Middle mouse button (button 1) — on-foot melee attack
      if (e.button === 1) this._meleeRequested = true;
    });
    // Suppress the context menu on middle-click so the browser doesn't steal the event
    this.canvas.addEventListener('auxclick', (e) => {
      if (e.button === 1) e.preventDefault();
    });
  }

  _bindTouch() {
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        const halfW = window.innerWidth / 2;
        if (touch.clientX < halfW) {
          // Left side = joystick
          if (!this._joystick.active) {
            this._joystick.active = true;
            this._joystick.id = touch.identifier;
            this._joystick.startX = touch.clientX;
            this._joystick.startY = touch.clientY;
            this._joystick.dx = 0;
            this._joystick.dy = 0;
          }
        } else {
          // Right side = aim + fire
          this._aimTouch.active = true;
          this._aimTouch.id = touch.identifier;
          this._aimTouch.x = touch.clientX;
          this._aimTouch.y = touch.clientY;
          this._turretAngle = this._screenToAngle(touch.clientX, touch.clientY);
          this._fireRequested = true;
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        if (touch.identifier === this._joystick.id) {
          this._joystick.dx = touch.clientX - this._joystick.startX;
          this._joystick.dy = touch.clientY - this._joystick.startY;
        }
        if (touch.identifier === this._aimTouch.id) {
          this._aimTouch.x = touch.clientX;
          this._aimTouch.y = touch.clientY;
          this._turretAngle = this._screenToAngle(touch.clientX, touch.clientY);
        }
      }
    }, { passive: false });

    const endTouch = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === this._joystick.id) {
          this._joystick.active = false;
          this._joystick.id = null;
          this._joystick.dx = 0;
          this._joystick.dy = 0;
        }
        if (touch.identifier === this._aimTouch.id) {
          this._aimTouch.active = false;
          this._aimTouch.id = null;
        }
      }
    };

    this.canvas.addEventListener('touchend', endTouch);
    this.canvas.addEventListener('touchcancel', endTouch);
  }

  _screenToAngle(x, y) {
    // Convert screen position to a world-relative turret angle
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    return Math.atan2(-(x - cx), -(y - cy));
  }

  getState() {
    const deadzone = 20;
    const joyActive = this._joystick.active;
    const jdx = this._joystick.dx;
    const jdy = this._joystick.dy;

    const state = {
      forward:
        this._keys['KeyW'] ||
        this._keys['ArrowUp'] ||
        (joyActive && jdy < -deadzone),
      backward:
        this._keys['KeyS'] ||
        this._keys['ArrowDown'] ||
        (joyActive && jdy > deadzone),
      left:
        this._keys['KeyA'] ||
        this._keys['ArrowLeft'] ||
        (joyActive && jdx < -deadzone),
      right:
        this._keys['KeyD'] ||
        this._keys['ArrowRight'] ||
        (joyActive && jdx > deadzone),
      fire: this._fireRequested,
      /** One-shot: F key or middle-click triggers an on-foot melee swing. */
      melee: this._meleeRequested,
      /** One-shot: R key triggers a manual reload for the on-foot gun (t030). */
      reload: this._reloadRequested,
      /** One-shot: Q key activates the context-appropriate ability slot (t042). */
      ability: this._abilityRequested,
      turretAngle: this._turretAngle,
      /** true while Tab is held — shows/hides the scoreboard overlay */
      tabHeld: !!this._keys['Tab'],
      /** One-shot: true on the frame E was pressed — exit tank or re-enter tank. */
      exitVehicle: this._exitVehicleRequested,
      /** One-shot: true on the frame 1 was pressed — switch to gun slot (t034). */
      switchToGun:   this._switchToGunRequested,
      /** One-shot: true on the frame 2 was pressed — switch to melee slot (t034). */
      switchToMelee: this._switchToMeleeRequested,
    };

    // Reset one-shot inputs
    this._fireRequested          = false;
    this._meleeRequested         = false;
    this._reloadRequested        = false;
    this._abilityRequested       = false;
    this._exitVehicleRequested   = false;
    this._switchToGunRequested   = false;
    this._switchToMeleeRequested = false;

    return state;
  }
}
