import React, { useEffect, useRef, useState, useCallback } from "react";
import Phaser from "phaser";

// Distinct colors — every ball is visually unique
const BALL_DEF = [
  { color: "#ffffff", label: "",   stripe: false }, // 0 cue
  { color: "#f5c518", label: "1",  stripe: false }, // 1 yellow
  { color: "#1a4fcc", label: "2",  stripe: false }, // 2 blue
  { color: "#d42020", label: "3",  stripe: false }, // 3 red
  { color: "#8b1aaa", label: "4",  stripe: false }, // 4 purple
  { color: "#e06010", label: "5",  stripe: false }, // 5 orange
  { color: "#1a8c2e", label: "6",  stripe: false }, // 6 green
  { color: "#8c1515", label: "7",  stripe: false }, // 7 maroon
  { color: "#111111", label: "8",  stripe: false }, // 8 black
  { color: "#f5c518", label: "9",  stripe: true  }, // 9  yellow stripe
  { color: "#1a4fcc", label: "10", stripe: true  }, // 10 blue stripe
  { color: "#d42020", label: "11", stripe: true  }, // 11 red stripe
  { color: "#8b1aaa", label: "12", stripe: true  }, // 12 purple stripe
  { color: "#e06010", label: "13", stripe: true  }, // 13 orange stripe
  { color: "#1a8c2e", label: "14", stripe: true  }, // 14 green stripe
  { color: "#8c1515", label: "15", stripe: true  }, // 15 maroon stripe
];

const TURN_SECONDS = 30;
const SIZE = 32; // texture canvas size

// Draw a ball onto an offscreen canvas and return it as a data-URL
function drawBallCanvas(num) {
  const def = BALL_DEF[num];
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d");
  const cx = SIZE / 2, cy = SIZE / 2, r = SIZE / 2 - 2;

  // Drop shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;

  if (def.stripe) {
    // White base
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff"; ctx.fill();
    // Colored stripe band (horizontal)
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = def.color;
    ctx.fillRect(0, cy - r * 0.42, SIZE, r * 0.84);
    ctx.restore();
    // Re-draw border
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = def.color; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();

  // Number badge (white circle)
  if (num > 0) {
    const br = num >= 10 ? 7.5 : 6.5;
    ctx.beginPath(); ctx.arc(cx, cy, br, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.fillStyle = "#111111";
    ctx.font = `bold ${num >= 10 ? 7 : 8}px Arial`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(def.label, cx, cy + 0.5);
  }

  // Specular highlight
  const grad = ctx.createRadialGradient(cx - r*0.3, cy - r*0.35, 0, cx, cy, r);
  grad.addColorStop(0, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.4, "rgba(255,255,255,0)");
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();

  return c;
}

export default function PoolGame() {
  const mountRef = useRef(null);
  const gameRef  = useRef(null);
  const sceneRef = useRef(null);
  const timerRef = useRef(null);

  const [ui, setUi] = useState({
    turn: 1,
    p1: { name: "Player 1", score: 0, potted: [], type: null },
    p2: { name: "Player 2", score: 0, potted: [], type: null },
    message: "Break! Player 1's turn",
    power: 0,
    ballsMoving: false,
    winner: null,
    p1Time: TURN_SECONDS,
    p2Time: TURN_SECONDS,
  });

  const startTimer = useCallback((player) => {
    clearInterval(timerRef.current);
    setUi(s => ({ ...s, p1Time: TURN_SECONDS, p2Time: TURN_SECONDS }));
    timerRef.current = setInterval(() => {
      setUi(s => {
        if (s.winner || s.ballsMoving) return s;
        const key = player === 1 ? "p1Time" : "p2Time";
        const nxt = s[key] - 1;
        if (nxt <= 0) {
          clearInterval(timerRef.current);
          if (sceneRef.current) sceneRef.current.timeoutTurn();
          return { ...s, [key]: 0 };
        }
        return { ...s, [key]: nxt };
      });
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => clearInterval(timerRef.current), []);
  useEffect(() => () => clearInterval(timerRef.current), []);

  useEffect(() => {
    if (gameRef.current || !mountRef.current) return;

    class PoolScene extends Phaser.Scene {
      constructor() { super("Pool"); }

      // ── Load ball canvases as Phaser textures ─────────────────────────────────
      preload() {
        for (let i = 0; i <= 15; i++) {
          const key = i === 0 ? "cueball" : `b${i}`;
          const canvas = drawBallCanvas(i);
          // Add canvas as texture
          if (!this.textures.exists(key)) {
            this.textures.addCanvas(key, canvas);
          }
        }
      }

      create() {
        sceneRef.current = this;

        this.tX = 500; this.tY = 300;
        this.tW = 820; this.tH = 440;
        this.left   = this.tX - this.tW / 2;
        this.right  = this.tX + this.tW / 2;
        this.top    = this.tY - this.tH / 2;
        this.bottom = this.tY + this.tH / 2;

        this.physics.world.setBounds(this.left, this.top, this.tW, this.tH);

        this.currentPlayer  = 1;
        this.scores         = { 1: 0, 2: 0 };
        this.pottedByPlayer = { 1: [], 2: [] };
        this.playerType     = { 1: null, 2: null };
        this.shooting       = false;
        this.shotFired      = false;
        this.pottedThisTurn = [];
        this.isDragging     = false;
        this.power          = 0;
        this.winner         = null;
        this.settleFrames   = 0;
        this.SETTLE_NEEDED  = 14;

        // Cue stick animation state
        this.cueAngle       = 0;
        this.cueAnimating   = false;
        this.cueAnimT       = 0;
        this.cueAnimShot    = { nx: 0, ny: 0, power: 0 };

        this.buildTable();

        // Pockets
        this.pocketPositions = [
          { x: this.left  + 20, y: this.top    + 20 },
          { x: this.tX,         y: this.top    -  4 },
          { x: this.right - 20, y: this.top    + 20 },
          { x: this.left  + 20, y: this.bottom - 20 },
          { x: this.tX,         y: this.bottom +  4 },
          { x: this.right - 20, y: this.bottom - 20 },
        ];
        const pocketGfx = this.add.graphics().setDepth(2);
        this.pocketPositions.forEach(p => {
          pocketGfx.fillStyle(0x000000, 1); pocketGfx.fillCircle(p.x, p.y, 18);
          pocketGfx.fillStyle(0x0a0a0a, 1); pocketGfx.fillCircle(p.x, p.y, 14);
          pocketGfx.lineStyle(2, 0x3d1c08, 1); pocketGfx.strokeCircle(p.x, p.y, 20);
        });

        // Cue ball
        this.cueBall = this.physics.add.image(this.left + this.tW * 0.25, this.tY, "cueball");
        this.setupBall(this.cueBall); this.cueBall.num = 0;

        // Rack
        this.balls = [];
        const rackX  = this.left + this.tW * 0.65;
        const order  = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
        let idx = 0;
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col <= row; col++) {
            const bx  = rackX + row * 24 * 0.87;
            const by  = this.tY + (col - row / 2) * 26;
            const num = order[idx++];
            const b   = this.physics.add.image(bx, by, `b${num}`);
            this.setupBall(b); b.num = num;
            this.balls.push(b);
          }
        }

        this.physics.add.collider(this.cueBall, this.balls);
        for (let i = 0; i < this.balls.length; i++)
          for (let j = i + 1; j < this.balls.length; j++)
            this.physics.add.collider(this.balls[i], this.balls[j]);

        // Graphics layers (aim BELOW cue, cue on top)
        this.aimGfx = this.add.graphics().setDepth(9);
        this.cueGfx = this.add.graphics().setDepth(11);

        this.input.on("pointerdown", this.onDown, this);
        this.input.on("pointermove", this.onMove, this);
        this.input.on("pointerup",   this.onUp,   this);

        this.pushUi({ message: "Break! Player 1's turn" });
        startTimer(1);
      }

      setupBall(b) {
        const r = SIZE / 2 - 2;
        b.setCircle(r, SIZE/2 - r, SIZE/2 - r);
        b.setBounce(0.72);
        b.setCollideWorldBounds(true);
        b.setDrag(0);
        b.setDepth(5);
        b.setMaxVelocity(900);
      }

      buildTable() {
        const { tX, tY, tW, tH } = this;
        const sh = this.add.graphics();
        sh.fillStyle(0x000000, 0.5);
        sh.fillRect(tX-tW/2-20+7, tY-tH/2-20+7, tW+40, tH+40);
        this.add.rectangle(tX, tY, tW+66, tH+66, 0x3d1c08);
        this.add.rectangle(tX, tY, tW+52, tH+52, 0x5c2e10);
        this.add.rectangle(tX, tY, tW+38, tH+38, 0x3d1c08);
        this.add.rectangle(tX, tY, tW, tH, 0x1a8080);
        const fl = this.add.graphics();
        fl.lineStyle(1, 0x158888, 0.2);
        for (let x = tX-tW/2; x <= tX+tW/2; x+=30) fl.lineBetween(x, tY-tH/2, x, tY+tH/2);
        for (let y = tY-tH/2; y <= tY+tH/2; y+=30) fl.lineBetween(tX-tW/2, y, tX+tW/2, y);
        this.add.circle(tX, tY, 4, 0xffffff, 0.18);
        this.add.circle(tX-tW*0.25, tY, 4, 0xffffff, 0.14);
      }

      // ── Input ─────────────────────────────────────────────────────────────────
      onDown(ptr) {
        if (this.shooting || this.winner || this.cueAnimating) return;
        this.isDragging = true;
      }
      onMove(ptr) {
        if (!this.isDragging || this.shooting) return;
        const dx = this.cueBall.x - ptr.x, dy = this.cueBall.y - ptr.y;
        this.power = Math.min(Math.sqrt(dx*dx+dy*dy) / 2.2, 100);
        setUi(s => ({ ...s, power: Math.round(this.power) }));
        this.drawAim(ptr);
      }
      onUp(ptr) {
        if (!this.isDragging || this.shooting) return;
        this.isDragging = false;
        const dx = this.cueBall.x - ptr.x, dy = this.cueBall.y - ptr.y;
        const dist = Math.sqrt(dx*dx+dy*dy);
        this.aimGfx.clear();
        if (dist < 8) { this.cueGfx.clear(); return; }

        const nx = dx/dist, ny = dy/dist;
        const spd = Math.min(dist * 5, 950);

        // Store for the shoot animation
        this.cueAnimating   = true;
        this.cueAnimT       = 0;
        this.cueAnimShot    = { nx, ny, power: this.power, spd, cx: this.cueBall.x, cy: this.cueBall.y };

        stopTimer();
        setUi(s => ({ ...s, power: 0, message: "In motion…" }));
      }

      // ── Cue stick draw (aim phase) ────────────────────────────────────────────
      drawAim(ptr) {
        this.aimGfx.clear(); this.cueGfx.clear();
        const cx = this.cueBall.x, cy = this.cueBall.y;
        const dx = cx - ptr.x, dy = cy - ptr.y;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if (dist < 2) return;
        const nx = dx/dist, ny = dy/dist;

        // Dotted guide line forward
        this.aimGfx.lineStyle(1.5, 0xffffff, 0.45);
        for (let i = 1; i < 12; i++) {
          const s = 18 + i*22, e = s+13;
          this.aimGfx.lineBetween(cx+nx*s, cy+ny*s, cx+nx*e, cy+ny*e);
        }
        // Aim ring
        this.aimGfx.lineStyle(1.5, 0xffffff, 0.6);
        this.aimGfx.strokeCircle(cx, cy, SIZE/2 + 3);

        this.drawCueStick(cx, cy, nx, ny, this.power, 1.0);
      }

      // ── Shared cue stick renderer ─────────────────────────────────────────────
      // pull: how far back the stick is pulled (px), alpha: opacity
      drawCueStick(cx, cy, nx, ny, power, alpha) {
        const pull  = 18 + power * 0.4; // pullback increases with power
        const tipX  = cx - nx * pull;
        const tipY  = cy - ny * pull;

        // Ferrule (white tip band)
        this.cueGfx.lineStyle(5, 0xeeeeee, alpha);
        this.cueGfx.lineBetween(tipX, tipY,
          cx - nx*(pull+8), cy - ny*(pull+8));

        // Shaft (light maple)
        this.cueGfx.lineStyle(5, 0xe8c87a, alpha);
        this.cueGfx.lineBetween(
          cx - nx*(pull+8),  cy - ny*(pull+8),
          cx - nx*(pull+90), cy - ny*(pull+90));

        // Mid wrap (darker wood)
        this.cueGfx.lineStyle(7, 0xc8901a, alpha * 0.95);
        this.cueGfx.lineBetween(
          cx - nx*(pull+90),  cy - ny*(pull+90),
          cx - nx*(pull+170), cy - ny*(pull+170));

        // Butt (dark handle)
        this.cueGfx.lineStyle(9, 0x6a3510, alpha * 0.9);
        this.cueGfx.lineBetween(
          cx - nx*(pull+170), cy - ny*(pull+170),
          cx - nx*(pull+250), cy - ny*(pull+250));

        // Butt cap
        this.cueGfx.lineStyle(10, 0x3a1a08, alpha * 0.85);
        this.cueGfx.lineBetween(
          cx - nx*(pull+250), cy - ny*(pull+250),
          cx - nx*(pull+265), cy - ny*(pull+265));
      }

      // ── Update ───────────────────────────────────────────────────────────────
      update(time, delta) {
        // ── Cue strike animation ─────────────────────────────────────────────
        if (this.cueAnimating) {
          this.cueAnimT += delta / 1000;
          const { nx, ny, power, spd, cx, cy } = this.cueAnimShot;

          // Phase 1 (0–0.08s): lunge forward (tip rushes toward ball)
          // Phase 2 (0.08–0.22s): follow-through + fade
          const LUNGE_DUR   = 0.075;
          const FADEOUT_DUR = 0.14;

          this.cueGfx.clear(); this.aimGfx.clear();

          if (this.cueAnimT < LUNGE_DUR) {
            // Move tip forward from pull position toward +4px past ball
            const progress = this.cueAnimT / LUNGE_DUR; // 0→1
            const currentPull = (18 + power * 0.4) * (1 - progress) - 4 * progress;
            this.drawCueStick(cx, cy, nx, ny, Math.max(0, currentPull / 0.4 - 18/0.4) , 1.0);
            // Actually just pass offset directly:
            this._drawCueRaw(cx, cy, nx, ny, currentPull, 1.0);
          } else {
            // Phase 2 — fade out as cue retracts
            const fadeProgress = (this.cueAnimT - LUNGE_DUR) / FADEOUT_DUR;
            if (fadeProgress < 1.0) {
              const retract = (18 + power * 0.4) * fadeProgress * 0.5;
              this._drawCueRaw(cx, cy, nx, ny, retract, 1.0 - fadeProgress);
            } else {
              // Animation done — fire the ball
              this.cueGfx.clear();
              this.cueAnimating = false;
              this.cueBall.setVelocity(nx * spd, ny * spd);
              this.shooting     = true;
              this.shotFired    = true;
              this.settleFrames = 0;
              this.pottedThisTurn = [];
              setUi(s => ({ ...s, ballsMoving: true }));
            }
          }
          return; // skip physics update during animation
        }

        if (!this.shooting) return;

        // ── Friction ──────────────────────────────────────────────────────────
        const allBalls = [this.cueBall, ...this.balls].filter(b => b.active && b.body);
        const FRICTION = 0.988, STOP_VEL = 6;
        allBalls.forEach(b => {
          b.body.velocity.x *= FRICTION;
          b.body.velocity.y *= FRICTION;
          if (Math.abs(b.body.velocity.x) < STOP_VEL) b.body.velocity.x = 0;
          if (Math.abs(b.body.velocity.y) < STOP_VEL) b.body.velocity.y = 0;
        });

        // ── Pocket detection ──────────────────────────────────────────────────
        this.balls.forEach(b => {
          if (!b.active) return;
          if (this.pocketPositions.some(p => Phaser.Math.Distance.Between(b.x,b.y,p.x,p.y) < 22))
            this.pocketBall(b);
        });
        if (this.cueBall.active &&
            this.pocketPositions.some(p => Phaser.Math.Distance.Between(this.cueBall.x,this.cueBall.y,p.x,p.y) < 22))
          this.scratch();

        // ── Settle detection ──────────────────────────────────────────────────
        const allStopped = allBalls.every(b => b.body.velocity.x === 0 && b.body.velocity.y === 0);
        if (allStopped) { this.settleFrames++; } else { this.settleFrames = 0; }
        if (this.settleFrames >= this.SETTLE_NEEDED && this.shotFired) {
          this.shotFired = false; this.shooting = false; this.settleFrames = 0;
          this.resolveTurn();
        }
      }

      // Raw cue draw with direct pullback offset in px
      _drawCueRaw(cx, cy, nx, ny, pullPx, alpha) {
        if (alpha <= 0) return;
        const p = pullPx;
        this.cueGfx.lineStyle(5, 0xeeeeee, alpha);
        this.cueGfx.lineBetween(cx-nx*p, cy-ny*p, cx-nx*(p+8), cy-ny*(p+8));
        this.cueGfx.lineStyle(5, 0xe8c87a, alpha);
        this.cueGfx.lineBetween(cx-nx*(p+8), cy-ny*(p+8), cx-nx*(p+90), cy-ny*(p+90));
        this.cueGfx.lineStyle(7, 0xc8901a, alpha*0.95);
        this.cueGfx.lineBetween(cx-nx*(p+90), cy-ny*(p+90), cx-nx*(p+170), cy-ny*(p+170));
        this.cueGfx.lineStyle(9, 0x6a3510, alpha*0.9);
        this.cueGfx.lineBetween(cx-nx*(p+170), cy-ny*(p+170), cx-nx*(p+250), cy-ny*(p+250));
        this.cueGfx.lineStyle(10, 0x3a1a08, alpha*0.85);
        this.cueGfx.lineBetween(cx-nx*(p+250), cy-ny*(p+250), cx-nx*(p+265), cy-ny*(p+265));
      }

      // ── Game logic ────────────────────────────────────────────────────────────
      pocketBall(b) {
        b.disableBody(true, true);
        this.pottedThisTurn.push(b.num);
        this.pottedByPlayer[this.currentPlayer].push(b.num);
        if (b.num !== 8 && !this.playerType[this.currentPlayer]) {
          const type = b.num <= 7 ? "solids" : "stripes";
          this.playerType[this.currentPlayer] = type;
          this.playerType[this.currentPlayer === 1 ? 2 : 1] = type === "solids" ? "stripes" : "solids";
        }
        this.scores[this.currentPlayer]++;
        if (b.num === 8) {
          const myType = this.playerType[this.currentPlayer];
          const [lo,hi] = myType === "solids" ? [1,7] : [9,15];
          const rem = this.balls.filter(x => x.active && x.num >= lo && x.num <= hi);
          this.winner = rem.length === 0 ? this.currentPlayer : (this.currentPlayer===1?2:1);
          this.pushUi({ winner: this.winner, message: `🏆 Player ${this.winner} wins!` });
          stopTimer();
        }
        this.syncScores();
      }

      scratch() {
        this.cueBall.disableBody(true, true);
        this.shooting = false; this.shotFired = false; this.settleFrames = 0;
        this.balls.forEach(b => { if (b.active && b.body) { b.body.velocity.x = 0; b.body.velocity.y = 0; }});
        this.time.delayedCall(700, () => {
          this.cueBall.enableBody(true, this.left + this.tW*0.25, this.tY, true, true);
          this.cueBall.setVelocity(0, 0);
          const next = this.currentPlayer===1?2:1;
          this.currentPlayer = next;
          this.pushUi({ turn: next, message: `Scratch! Player ${next} — ball in hand` });
          startTimer(next);
        });
      }

      timeoutTurn() {
        if (this.shooting || this.winner) return;
        const next = this.currentPlayer===1?2:1;
        this.currentPlayer = next;
        this.pushUi({ turn: next, message: `Time's up! Player ${next}'s turn` });
        startTimer(next);
      }

      resolveTurn() {
        if (this.winner) return;
        const myType = this.playerType[this.currentPlayer];
        const pottedOwn = this.pottedThisTurn.some(n => {
          if (!myType) return n !== 8;
          return myType === "solids" ? (n>=1&&n<=7) : (n>=9&&n<=15);
        });
        const next = pottedOwn ? this.currentPlayer : (this.currentPlayer===1?2:1);
        this.currentPlayer = next;
        this.pushUi({ turn: next, ballsMoving: false, message: `Player ${next}'s turn` });
        startTimer(next);
      }

      syncScores() {
        setUi(s => ({
          ...s,
          p1: { ...s.p1, score: this.scores[1], potted: [...this.pottedByPlayer[1]], type: this.playerType[1] },
          p2: { ...s.p2, score: this.scores[2], potted: [...this.pottedByPlayer[2]], type: this.playerType[2] },
        }));
      }

      pushUi(patch) { this.syncScores(); setUi(s => ({ ...s, ...patch })); }
    }

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: 1000, height: 600,
      parent: mountRef.current,
      backgroundColor: "#0d1117",
      physics: { default: "arcade", arcade: { debug: false, gravity: { x:0, y:0 } } },
      scene: PoolScene,
    });

    return () => { gameRef.current?.destroy(true); gameRef.current = null; sceneRef.current = null; };
  // eslint-disable-next-line
  }, []);

  // ── React UI ─────────────────────────────────────────────────────────────────
  const BallIcon = ({ num, size = 22 }) => {
    const def    = BALL_DEF[num];
    const stripe = def.stripe;
    const bgStyle = stripe
      ? `linear-gradient(180deg,#fff 28%,${def.color} 28%,${def.color} 72%,#fff 72%)`
      : def.color;
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: bgStyle,
        border: "1.5px solid rgba(255,255,255,0.3)",
        boxShadow: `0 0 5px ${def.color}77`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.33 + "px", fontWeight: "bold",
        color: "#111", textShadow: "none",
        fontFamily: "Arial, sans-serif",
        position: "relative",
      }}>
        <span style={{
          background: "rgba(255,255,255,0.9)", borderRadius: "50%",
          width: "55%", height: "55%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size * 0.3 + "px", color: "#111", fontWeight: "bold",
        }}>
          {num > 0 ? num : ""}
        </span>
      </div>
    );
  };

  const TimerRing = ({ seconds, isActive }) => {
    const r = 22, cxy = 24;
    const circ = 2 * Math.PI * r;
    const pct  = seconds / TURN_SECONDS;
    const color = seconds <= 8 ? "#ef4444" : seconds <= 15 ? "#f59e0b" : "#4ade80";
    return (
      <svg width={48} height={48} style={{ position:"absolute",top:-3,left:-3,pointerEvents:"none" }}>
        <circle cx={cxy} cy={cxy} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={3}/>
        {isActive && (
          <circle cx={cxy} cy={cxy} r={r} fill="none"
            stroke={color} strokeWidth={3}
            strokeDasharray={`${circ*pct} ${circ}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${cxy} ${cxy})`}
            style={{ transition:"stroke-dasharray 0.9s linear,stroke 0.3s" }}
          />
        )}
      </svg>
    );
  };

  const PlayerPanel = ({ player, data, isActive, timeLeft }) => {
    const accent = player===1 ? "#e06010" : "#1a4fcc";
    return (
      <div style={{
        display:"flex", alignItems:"center", gap:12,
        background: isActive ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.35)",
        border: `2px solid ${isActive?"#4ade80":"rgba(255,255,255,0.1)"}`,
        borderRadius:14, padding:"8px 14px", transition:"all 0.3s", minWidth:210,
      }}>
        <div style={{ position:"relative", width:42, height:42, flexShrink:0 }}>
          <div style={{
            width:42, height:42, borderRadius:"50%",
            background:`linear-gradient(135deg,${accent},${accent}88)`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:20, border:`2px solid ${isActive?"#4ade80":"rgba(255,255,255,0.2)"}`,
          }}>
            {player===1?"🧑":"👤"}
          </div>
          <TimerRing seconds={timeLeft} isActive={isActive && !ui.winner && !ui.ballsMoving} />
        </div>
        <div style={{flex:1}}>
          <div style={{color:isActive?"#4ade80":"#ccc",fontWeight:"bold",fontSize:13,letterSpacing:1}}>
            {data.name}
          </div>
          <div style={{color:"#888",fontSize:11}}>{data.type||"unassigned"} · {data.score} potted</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:38}}>
          <div style={{
            fontSize:22, fontWeight:"bold", lineHeight:1,
            color: isActive ? (timeLeft<=8?"#ef4444":timeLeft<=15?"#f59e0b":"#4ade80") : "rgba(255,255,255,0.2)",
            transition:"color 0.3s",
          }}>
            {isActive ? timeLeft : "—"}
          </div>
          {isActive && <div style={{fontSize:9,color:"#555",letterSpacing:1}}>SEC</div>}
        </div>
      </div>
    );
  };

  const PottedRack = ({ p1, p2 }) => {
    const all = [
      ...p1.potted.map(n=>({n,player:1})),
      ...p2.potted.map(n=>({n,player:2})),
    ].sort((a,b)=>a.n-b.n);
    return (
      <div style={{
        display:"flex",flexDirection:"column",alignItems:"center",gap:5,
        background:"rgba(0,0,0,0.55)",border:"1px solid rgba(255,255,255,0.1)",
        borderRadius:12,padding:"10px 7px",minHeight:200,minWidth:44,
      }}>
        <div style={{color:"#555",fontSize:9,letterSpacing:1,marginBottom:4,writingMode:"vertical-rl",transform:"rotate(180deg)"}}>
          POTTED
        </div>
        {all.length===0 && <div style={{color:"#333",fontSize:10}}>—</div>}
        {all.map((item,i)=>(
          <div key={i} style={{position:"relative"}}>
            <BallIcon num={item.n} size={28}/>
            <div style={{
              position:"absolute",top:-2,right:-2,
              width:9,height:9,borderRadius:"50%",
              background:item.player===1?"#e06010":"#1a4fcc",
              border:"1px solid #fff",
            }}/>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{
      minHeight:"100vh",
      background:"linear-gradient(160deg,#0d1117 0%,#12151e 100%)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      fontFamily:"'Georgia','Times New Roman',serif",
      userSelect:"none",padding:16,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <span style={{fontSize:"1.5rem"}}>🎱</span>
        <h1 style={{margin:0,fontSize:"1.6rem",letterSpacing:4,color:"#e8c97a",textTransform:"uppercase",textShadow:"0 0 18px rgba(232,201,122,0.5)"}}>
          TheCueArena
        </h1>
        <span style={{fontSize:"1.5rem"}}>🎱</span>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:10,width:"100%",maxWidth:1060,justifyContent:"space-between"}}>
        <PlayerPanel player={1} data={ui.p1} isActive={ui.turn===1&&!ui.winner} timeLeft={ui.p1Time}/>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"8px 16px",color:ui.winner?"#fbbf24":"#e2e8f0",fontSize:13,marginBottom:6}}>
            {ui.message}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}>
            <span style={{color:"#555",fontSize:10,letterSpacing:1}}>PWR</span>
            <div style={{width:140,height:8,background:"rgba(255,255,255,0.1)",borderRadius:4,overflow:"hidden"}}>
              <div style={{
                width:`${ui.power}%`,height:"100%",borderRadius:4,
                background:ui.power>70?"#ef4444":ui.power>40?"#f59e0b":"#22c55e",
                transition:"width 0.04s",
              }}/>
            </div>
            <span style={{color:"#e8c97a",fontSize:11,minWidth:28}}>{ui.power}%</span>
          </div>
        </div>
        <PlayerPanel player={2} data={ui.p2} isActive={ui.turn===2&&!ui.winner} timeLeft={ui.p2Time}/>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{borderRadius:14,overflow:"hidden",boxShadow:"0 0 50px rgba(0,0,0,0.8),0 0 16px rgba(232,201,122,0.07)",border:"2px solid rgba(232,201,122,0.15)"}}>
          <div ref={mountRef}/>
        </div>
        <PottedRack p1={ui.p1} p2={ui.p2}/>
      </div>

      <div style={{marginTop:10,display:"flex",gap:20,color:"#3a3a4a",fontSize:11,letterSpacing:1}}>
        <span>🖱 DRAG from cue ball</span>
        <span>↔ DISTANCE = POWER</span>
        <span>🖱 RELEASE to shoot</span>
      </div>

      {ui.winner && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}}>
          <div style={{background:"linear-gradient(135deg,#1a1a2e,#16213e)",border:"2px solid #e8c97a",borderRadius:20,padding:"48px 64px",textAlign:"center",boxShadow:"0 0 80px rgba(232,201,122,0.3)"}}>
            <div style={{fontSize:"3rem",marginBottom:10}}>🏆</div>
            <h2 style={{color:"#e8c97a",fontSize:"2rem",margin:"0 0 8px",letterSpacing:2}}>PLAYER {ui.winner} WINS!</h2>
            <p style={{color:"#888",marginBottom:28}}>P1: {ui.p1.score} potted · P2: {ui.p2.score} potted</p>
            <button onClick={()=>window.location.reload()} style={{
              background:"linear-gradient(135deg,#e8c97a,#c9a227)",color:"#1a1a2e",border:"none",
              borderRadius:10,padding:"12px 36px",fontSize:"1rem",fontWeight:"bold",cursor:"pointer",
              letterSpacing:2,textTransform:"uppercase",
            }}>Play Again</button>
          </div>
        </div>
      )}
    </div>
  );
}
