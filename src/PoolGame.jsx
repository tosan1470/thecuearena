import React, { useEffect, useRef, useState, useCallback } from "react";
import Phaser from "phaser";

const BALL_COLORS = [
  null,
  0xf5c518, 0x1a4fcc, 0xd42020, 0x8b1aaa, 0xe06010,
  0x1a8c2e, 0x8c1515, 0x111111,
  0xf5c518, 0x1a4fcc, 0xd42020, 0x8b1aaa, 0xe06010,
  0x1a8c2e, 0x8c1515,
];

const TURN_SECONDS = 30;

export default function PoolGame() {
  const mountRef  = useRef(null);
  const gameRef   = useRef(null);
  const sceneRef  = useRef(null);
  const timerRef  = useRef(null);

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

  // ── turn timer ───────────────────────────────────────────────────────────────
  const startTimer = useCallback((player) => {
    clearInterval(timerRef.current);
    setUi(s => ({ ...s, p1Time: TURN_SECONDS, p2Time: TURN_SECONDS }));

    timerRef.current = setInterval(() => {
      setUi(s => {
        if (s.winner || s.ballsMoving) return s;
        const key = player === 1 ? "p1Time" : "p2Time";
        const next = s[key] - 1;
        if (next <= 0) {
          clearInterval(timerRef.current);
          // Force turn switch via scene
          if (sceneRef.current) sceneRef.current.timeoutTurn();
          return { ...s, [key]: 0 };
        }
        return { ...s, [key]: next };
      });
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    clearInterval(timerRef.current);
  }, []);

  useEffect(() => () => clearInterval(timerRef.current), []);

  // ── Phaser game ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (gameRef.current || !mountRef.current) return;

    class PoolScene extends Phaser.Scene {
      constructor() { super("Pool"); }

      // ── texture helpers ──────────────────────────────────────────────────────
      makeTex(key, fn) {
        if (this.textures.exists(key)) return;
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        fn(g);
        g.generateTexture(key, 28, 28);
        g.destroy();
      }

      genBallTex(num) {
        const key = num === 0 ? "cueball" : `b${num}`;
        const color = num === 0 ? 0xffffff : BALL_COLORS[num];
        const stripe = num >= 9;
        this.makeTex(key, g => {
          g.fillStyle(0x000000, 0.25); g.fillCircle(15, 16, 12);
          if (stripe) {
            g.fillStyle(0xffffff, 1); g.fillCircle(14, 14, 12);
            g.fillStyle(color, 1);
            g.slice(14, 14, 12, Phaser.Math.DegToRad(-50), Phaser.Math.DegToRad(230), false);
            g.fillPath();
          } else {
            g.fillStyle(color, 1); g.fillCircle(14, 14, 12);
          }
          if (num > 0) { g.fillStyle(0xffffff, 0.9); g.fillCircle(14, 14, 5); }
          g.fillStyle(0xffffff, 0.45); g.fillCircle(10, 9, 4);
        });
        return key;
      }

      // ── create ───────────────────────────────────────────────────────────────
      create() {
        sceneRef.current = this;

        this.tX = 500; this.tY = 300;
        this.tW = 820; this.tH = 440;
        this.left   = this.tX - this.tW / 2;
        this.right  = this.tX + this.tW / 2;
        this.top    = this.tY - this.tH / 2;
        this.bottom = this.tY + this.tH / 2;

        this.physics.world.setBounds(this.left, this.top, this.tW, this.tH);

        // game state
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
        // settling: count frames where all balls are slow
        this.settleFrames   = 0;
        this.SETTLE_NEEDED  = 12; // must be slow for 12 consecutive frames

        this.buildTable();

        // pockets
        this.pocketPositions = [
          { x: this.left  + 20, y: this.top    + 20 },
          { x: this.tX,         y: this.top    -  4 },
          { x: this.right - 20, y: this.top    + 20 },
          { x: this.left  + 20, y: this.bottom - 20 },
          { x: this.tX,         y: this.bottom +  4 },
          { x: this.right - 20, y: this.bottom - 20 },
        ];
        this.makeTex("pocket", g => {
          g.fillStyle(0x000000, 1); g.fillCircle(14, 14, 14);
          g.fillStyle(0x111111, 1); g.fillCircle(14, 14, 10);
        });
        this.pocketPositions.forEach(p =>
          this.add.image(p.x, p.y, "pocket").setDepth(2)
        );

        // balls
        this.genBallTex(0);
        this.cueBall = this.physics.add.image(this.left + this.tW * 0.25, this.tY, "cueball");
        this.setupBall(this.cueBall);
        this.cueBall.num = 0;

        this.balls = [];
        const rackX = this.left + this.tW * 0.65;
        const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
        let idx = 0;
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col <= row; col++) {
            const bx = rackX + row * 24 * 0.87;
            const by = this.tY + (col - row / 2) * 25;
            const num = order[idx++];
            this.genBallTex(num);
            const b = this.physics.add.image(bx, by, `b${num}`);
            this.setupBall(b);
            b.num = num;
            this.balls.push(b);
          }
        }

        this.physics.add.collider(this.cueBall, this.balls);
        for (let i = 0; i < this.balls.length; i++)
          for (let j = i + 1; j < this.balls.length; j++)
            this.physics.add.collider(this.balls[i], this.balls[j]);

        this.aimGfx = this.add.graphics().setDepth(10);
        this.cueGfx = this.add.graphics().setDepth(10);

        this.input.on("pointerdown", this.onDown, this);
        this.input.on("pointermove", this.onMove, this);
        this.input.on("pointerup",   this.onUp,   this);

        this.pushUi({ message: "Break! Player 1's turn" });
        startTimer(1);
      }

      setupBall(b) {
        b.setCircle(13, 1, 1);
        b.setBounce(0.72);
        b.setCollideWorldBounds(true);
        // NO setDamping — we handle friction manually so we control exact stop
        b.setDrag(0);
        b.setDepth(5);
        b.setMaxVelocity(900);
      }

      buildTable() {
        const { tX, tY, tW, tH } = this;
        const s = this.add.graphics();
        s.fillStyle(0x000000, 0.55);
        s.fillRect(tX - tW/2 - 22 + 8, tY - tH/2 - 22 + 8, tW + 44, tH + 44);
        this.add.rectangle(tX, tY, tW + 64, tH + 64, 0x3d1c08);
        this.add.rectangle(tX, tY, tW + 50, tH + 50, 0x5c2e10);
        this.add.rectangle(tX, tY, tW + 36, tH + 36, 0x3d1c08);
        this.add.rectangle(tX, tY, tW, tH, 0x1a8080);
        const fl = this.add.graphics();
        fl.lineStyle(1, 0x158888, 0.25);
        for (let x = tX - tW/2; x <= tX + tW/2; x += 30)
          fl.lineBetween(x, tY - tH/2, x, tY + tH/2);
        for (let y = tY - tH/2; y <= tY + tH/2; y += 30)
          fl.lineBetween(tX - tW/2, y, tX + tW/2, y);
        this.add.circle(tX, tY, 4, 0xffffff, 0.2);
        this.add.circle(tX - tW * 0.25, tY, 4, 0xffffff, 0.15);
      }

      // ── input ────────────────────────────────────────────────────────────────
      onDown(ptr) {
        if (this.shooting || this.winner) return;
        this.isDragging = true;
      }
      onMove(ptr) {
        if (!this.isDragging || this.shooting) return;
        const dx = this.cueBall.x - ptr.x;
        const dy = this.cueBall.y - ptr.y;
        this.power = Math.min(Math.sqrt(dx*dx + dy*dy) / 2.2, 100);
        setUi(s => ({ ...s, power: Math.round(this.power) }));
        this.drawAim(ptr);
      }
      onUp(ptr) {
        if (!this.isDragging || this.shooting) return;
        this.isDragging = false;
        this.aimGfx.clear(); this.cueGfx.clear();
        const dx = this.cueBall.x - ptr.x;
        const dy = this.cueBall.y - ptr.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 8) return;
        const spd = Math.min(dist * 5, 950);
        const a = Math.atan2(dy, dx);
        this.cueBall.setVelocity(Math.cos(a)*spd, Math.sin(a)*spd);
        this.shooting = true;
        this.shotFired = true;
        this.settleFrames = 0;
        this.pottedThisTurn = [];
        stopTimer();
        setUi(s => ({ ...s, ballsMoving: true, power: 0, message: "In motion…" }));
      }

      drawAim(ptr) {
        this.aimGfx.clear(); this.cueGfx.clear();
        const cx = this.cueBall.x, cy = this.cueBall.y;
        const dx = cx - ptr.x, dy = cy - ptr.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 2) return;
        const nx = dx/dist, ny = dy/dist;
        this.aimGfx.lineStyle(1.5, 0xffffff, 0.5);
        for (let i = 1; i < 10; i++) {
          const s = 18 + i*22, e = s+14;
          this.aimGfx.lineBetween(cx+nx*s, cy+ny*s, cx+nx*e, cy+ny*e);
        }
        this.aimGfx.lineStyle(1.5, 0xffffff, 0.65);
        this.aimGfx.strokeCircle(cx, cy, 16);
        const pull = 16 + this.power * 0.35;
        this.cueGfx.lineStyle(4, 0xd4aa20, 1);
        this.cueGfx.lineBetween(cx - nx*pull, cy - ny*pull,
                                  cx - nx*(pull+40), cy - ny*(pull+40));
        this.cueGfx.lineStyle(7, 0xc8901a, 0.95);
        this.cueGfx.lineBetween(cx - nx*(pull+40), cy - ny*(pull+40),
                                  cx - nx*(pull+130), cy - ny*(pull+130));
        this.cueGfx.lineStyle(9, 0x7a4010, 0.9);
        this.cueGfx.lineBetween(cx - nx*(pull+130), cy - ny*(pull+130),
                                  cx - nx*(pull+220), cy - ny*(pull+220));
      }

      // ── update ───────────────────────────────────────────────────────────────
      update() {
        if (!this.shooting) return;

        const allBalls = [this.cueBall, ...this.balls].filter(b => b.active && b.body);

        // ── Manual friction (applied every frame) ──────────────────────────────
        // Use a strong friction factor so balls actually slow to a stop
        const FRICTION = 0.988;
        const STOP_VEL = 6; // px/s threshold — below this we hard-zero the velocity

        allBalls.forEach(b => {
          b.body.velocity.x *= FRICTION;
          b.body.velocity.y *= FRICTION;
          // Hard-zero micro velocities so balls don't creep forever
          if (Math.abs(b.body.velocity.x) < STOP_VEL) b.body.velocity.x = 0;
          if (Math.abs(b.body.velocity.y) < STOP_VEL) b.body.velocity.y = 0;
        });

        // ── Pocket detection ──────────────────────────────────────────────────
        this.balls.forEach(b => {
          if (!b.active) return;
          if (this.pocketPositions.some(p =>
            Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y) < 24))
            this.pocketBall(b);
        });

        if (this.cueBall.active &&
            this.pocketPositions.some(p =>
              Phaser.Math.Distance.Between(this.cueBall.x, this.cueBall.y, p.x, p.y) < 24))
          this.scratch();

        // ── Settle detection (consecutive-frame counter) ──────────────────────
        const allStopped = allBalls.every(b =>
          b.body.velocity.x === 0 && b.body.velocity.y === 0
        );

        if (allStopped) {
          this.settleFrames++;
        } else {
          this.settleFrames = 0; // reset if anything is still moving
        }

        if (this.settleFrames >= this.SETTLE_NEEDED && this.shotFired) {
          this.shotFired  = false;
          this.shooting   = false;
          this.settleFrames = 0;
          this.resolveTurn();
        }
      }

      // ── game logic ───────────────────────────────────────────────────────────
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
          const myType  = this.playerType[this.currentPlayer];
          const [lo,hi] = myType === "solids" ? [1,7] : [9,15];
          const remaining = this.balls.filter(x => x.active && x.num >= lo && x.num <= hi);
          this.winner = remaining.length === 0
            ? this.currentPlayer
            : (this.currentPlayer === 1 ? 2 : 1);
          this.pushUi({ winner: this.winner, message: `🏆 Player ${this.winner} wins!` });
          stopTimer();
        }
        this.syncScores();
      }

      scratch() {
        this.cueBall.disableBody(true, true);
        this.shooting = false;
        this.shotFired = false;
        this.settleFrames = 0;
        // Force stop all other balls too
        this.balls.forEach(b => {
          if (b.active && b.body) { b.body.velocity.x = 0; b.body.velocity.y = 0; }
        });
        this.time.delayedCall(700, () => {
          this.cueBall.enableBody(true, this.left + this.tW * 0.25, this.tY, true, true);
          this.cueBall.setVelocity(0, 0);
          const next = this.currentPlayer === 1 ? 2 : 1;
          this.currentPlayer = next;
          this.pushUi({ turn: next, message: `Scratch! Player ${next} — ball in hand` });
          startTimer(next);
        });
      }

      timeoutTurn() {
        if (this.shooting || this.winner) return;
        const next = this.currentPlayer === 1 ? 2 : 1;
        this.currentPlayer = next;
        this.pushUi({ turn: next, message: `Time's up! Player ${next}'s turn` });
        startTimer(next);
      }

      resolveTurn() {
        if (this.winner) return;
        const myType   = this.playerType[this.currentPlayer];
        const pottedOwn = this.pottedThisTurn.some(n => {
          if (!myType) return n !== 8;
          return myType === "solids" ? (n >= 1 && n <= 7) : (n >= 9 && n <= 15);
        });
        const next = pottedOwn ? this.currentPlayer : (this.currentPlayer === 1 ? 2 : 1);
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

      pushUi(patch) {
        this.syncScores();
        setUi(s => ({ ...s, ...patch }));
      }
    }

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: 1000,
      height: 600,
      parent: mountRef.current,
      backgroundColor: "#0d1117",
      physics: { default: "arcade", arcade: { debug: false, gravity: { x:0, y:0 } } },
      scene: PoolScene,
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  // eslint-disable-next-line
  }, []);

  // ── React components ─────────────────────────────────────────────────────────
  const BallIcon = ({ num, size = 20 }) => {
    const hex  = num === 0 ? "#ffffff" : `#${BALL_COLORS[num].toString(16).padStart(6,"0")}`;
    const stripe = num >= 9;
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: stripe
          ? `linear-gradient(180deg,#fff 28%,${hex} 28%,${hex} 72%,#fff 72%)`
          : hex,
        border: "1.5px solid rgba(255,255,255,0.3)",
        boxShadow: `0 0 5px ${hex}66`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.36 + "px", fontWeight: "bold",
        color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.9)",
      }}>
        {num > 0 ? num : ""}
      </div>
    );
  };

  // Circular SVG timer ring around the avatar
  const TimerRing = ({ seconds, isActive }) => {
    const r = 22, cx = 24, cy = 24;
    const circ = 2 * Math.PI * r;
    const pct  = seconds / TURN_SECONDS;
    const dash = circ * pct;
    const color = seconds <= 8 ? "#ef4444" : seconds <= 15 ? "#f59e0b" : "#4ade80";
    return (
      <svg width={48} height={48} style={{ position: "absolute", top: -3, left: -3, pointerEvents: "none" }}>
        {/* track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={3} />
        {/* progress */}
        {isActive && (
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke={color} strokeWidth={3}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: "stroke-dasharray 0.9s linear, stroke 0.3s" }}
          />
        )}
      </svg>
    );
  };

  const PlayerPanel = ({ player, data, isActive, timeLeft }) => {
    const p1Color = "#e06010"; const p2Color = "#1a4fcc";
    const accent  = player === 1 ? p1Color : p2Color;
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        background: isActive ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.35)",
        border: `2px solid ${isActive ? "#4ade80" : "rgba(255,255,255,0.1)"}`,
        borderRadius: 14, padding: "8px 14px",
        transition: "all 0.3s", minWidth: 210,
      }}>
        {/* Avatar with timer ring */}
        <div style={{ position: "relative", width: 42, height: 42, flexShrink: 0 }}>
          <div style={{
            width: 42, height: 42, borderRadius: "50%",
            background: `linear-gradient(135deg,${accent},${accent}88)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, border: `2px solid ${isActive ? "#4ade80" : "rgba(255,255,255,0.2)"}`,
          }}>
            {player === 1 ? "🧑" : "👤"}
          </div>
          <TimerRing seconds={timeLeft} isActive={isActive && !ui.winner && !ui.ballsMoving} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ color: isActive ? "#4ade80" : "#ccc", fontWeight: "bold", fontSize: 13, letterSpacing: 1 }}>
            {data.name}
          </div>
          <div style={{ color: "#888", fontSize: 11 }}>
            {data.type || "unassigned"} · {data.score} potted
          </div>
        </div>

        {/* Countdown number */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          minWidth: 38,
        }}>
          <div style={{
            fontSize: 22, fontWeight: "bold", lineHeight: 1,
            color: isActive
              ? (timeLeft <= 8 ? "#ef4444" : timeLeft <= 15 ? "#f59e0b" : "#4ade80")
              : "rgba(255,255,255,0.25)",
            transition: "color 0.3s",
          }}>
            {isActive ? timeLeft : "—"}
          </div>
          {isActive && <div style={{ fontSize: 9, color: "#555", letterSpacing: 1 }}>SEC</div>}
        </div>
      </div>
    );
  };

  const PottedRack = ({ p1, p2 }) => {
    const all = [
      ...p1.potted.map(n => ({ n, player: 1 })),
      ...p2.potted.map(n => ({ n, player: 2 })),
    ].sort((a,b) => a.n - b.n);
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12, padding: "10px 8px", minHeight: 200, minWidth: 46,
      }}>
        <div style={{
          color: "#666", fontSize: 9, letterSpacing: 1, marginBottom: 4,
          writingMode: "vertical-rl", transform: "rotate(180deg)",
        }}>POTTED</div>
        {all.length === 0 && <div style={{ color: "#333", fontSize: 10 }}>—</div>}
        {all.map((item, i) => (
          <div key={i} style={{ position: "relative" }}>
            <BallIcon num={item.n} size={28} />
            <div style={{
              position: "absolute", top: -3, right: -3,
              width: 10, height: 10, borderRadius: "50%",
              background: item.player === 1 ? "#e06010" : "#1a4fcc",
              border: "1px solid #fff",
            }} />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg,#0d1117 0%,#12151e 100%)",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Georgia','Times New Roman',serif",
      userSelect: "none", padding: 16,
    }}>
      {/* Title */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: "1.5rem" }}>🎱</span>
        <h1 style={{
          margin: 0, fontSize: "1.6rem", letterSpacing: 4,
          color: "#e8c97a", textTransform: "uppercase",
          textShadow: "0 0 18px rgba(232,201,122,0.5)",
        }}>TheCueArena</h1>
        <span style={{ fontSize: "1.5rem" }}>🎱</span>
      </div>

      {/* HUD */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14, marginBottom: 10,
        width: "100%", maxWidth: 1060, justifyContent: "space-between",
      }}>
        <PlayerPanel player={1} data={ui.p1} isActive={ui.turn===1 && !ui.winner} timeLeft={ui.p1Time} />

        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10, padding: "8px 16px",
            color: ui.winner ? "#fbbf24" : "#e2e8f0", fontSize: 13, marginBottom: 6,
          }}>
            {ui.message}
          </div>
          {/* Power bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
            <span style={{ color: "#555", fontSize: 10, letterSpacing: 1 }}>PWR</span>
            <div style={{ width: 140, height: 8, background: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                width: `${ui.power}%`, height: "100%", borderRadius: 4,
                background: ui.power > 70 ? "#ef4444" : ui.power > 40 ? "#f59e0b" : "#22c55e",
                transition: "width 0.04s",
              }} />
            </div>
            <span style={{ color: "#e8c97a", fontSize: 11, minWidth: 28 }}>{ui.power}%</span>
          </div>
        </div>

        <PlayerPanel player={2} data={ui.p2} isActive={ui.turn===2 && !ui.winner} timeLeft={ui.p2Time} />
      </div>

      {/* Canvas + potted rack */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          borderRadius: 14, overflow: "hidden",
          boxShadow: "0 0 50px rgba(0,0,0,0.8), 0 0 16px rgba(232,201,122,0.07)",
          border: "2px solid rgba(232,201,122,0.15)",
        }}>
          <div ref={mountRef} />
        </div>
        <PottedRack p1={ui.p1} p2={ui.p2} />
      </div>

      {/* Hints */}
      <div style={{ marginTop: 10, display: "flex", gap: 20, color: "#3a3a4a", fontSize: 11, letterSpacing: 1 }}>
        <span>🖱 DRAG from cue ball</span>
        <span>↔ DISTANCE = POWER</span>
        <span>🖱 RELEASE to shoot</span>
      </div>

      {/* Winner overlay */}
      {ui.winner && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999,
        }}>
          <div style={{
            background: "linear-gradient(135deg,#1a1a2e,#16213e)",
            border: "2px solid #e8c97a", borderRadius: 20,
            padding: "48px 64px", textAlign: "center",
            boxShadow: "0 0 80px rgba(232,201,122,0.3)",
          }}>
            <div style={{ fontSize: "3rem", marginBottom: 10 }}>🏆</div>
            <h2 style={{ color: "#e8c97a", fontSize: "2rem", margin: "0 0 8px", letterSpacing: 2 }}>
              PLAYER {ui.winner} WINS!
            </h2>
            <p style={{ color: "#888", marginBottom: 28 }}>
              P1: {ui.p1.score} potted · P2: {ui.p2.score} potted
            </p>
            <button onClick={() => window.location.reload()} style={{
              background: "linear-gradient(135deg,#e8c97a,#c9a227)",
              color: "#1a1a2e", border: "none", borderRadius: 10,
              padding: "12px 36px", fontSize: "1rem",
              fontWeight: "bold", cursor: "pointer",
              letterSpacing: 2, textTransform: "uppercase",
            }}>
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
