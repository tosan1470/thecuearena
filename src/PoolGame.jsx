import React, { useEffect, useRef, useState } from "react";
import Phaser from "phaser";

export default function PoolGame() {
  const gameRef = useRef(null);
  const sceneRef = useRef(null);
  const [gameState, setGameState] = useState({
    turn: 1,
    p1Score: 0,
    p2Score: 0,
    message: "Player 1's Turn — Click & drag to aim",
    power: 0,
    shooting: false,
    winner: null,
  });

  useEffect(() => {
    if (gameRef.current) return;

    class PoolScene extends Phaser.Scene {
      constructor() {
        super("PoolScene");
        this.isDragging = false;
        this.dragStart = null;
        this.power = 0;
        this.currentPlayer = 1;
        this.scores = { 1: 0, 2: 0 };
        this.ballsMoving = false;
        this.shotFired = false;
        this.ballsPocketed = 0;
      }

      preload() {
        // Generate all textures programmatically
      }

      generateBallTexture(name, color, number) {
        const g = this.add.graphics();
        // Shadow
        g.fillStyle(0x000000, 0.25);
        g.fillCircle(14, 15, 13);
        // Main ball
        g.fillStyle(color, 1);
        g.fillCircle(13, 13, 13);
        // Highlight
        g.fillStyle(0xffffff, 0.45);
        g.fillCircle(9, 8, 5);
        // Stripe overlay for striped balls
        if (number > 8 && number <= 15) {
          g.fillStyle(0xffffff, 1);
          g.fillRect(0, 6, 26, 14);
          g.fillStyle(color, 1);
          g.fillCircle(13, 13, 7);
          // Re-highlight
          g.fillStyle(0xffffff, 0.4);
          g.fillCircle(9, 8, 4);
        }
        g.generateTexture(name, 26, 26);
        g.destroy();
      }

      generateCueBallTexture() {
        const g = this.add.graphics();
        g.fillStyle(0x000000, 0.2);
        g.fillCircle(14, 15, 13);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(13, 13, 13);
        g.fillStyle(0xffffff, 0.6);
        g.fillCircle(9, 8, 5);
        g.generateTexture("cueBall", 26, 26);
        g.destroy();
      }

      create() {
        sceneRef.current = this;

        const W = 1000, H = 600;
        const tableX = 500, tableY = 300;
        const tableW = 860, tableH = 460;

        // Dark background
        this.add.rectangle(W / 2, H / 2, W, H, 0x0d0d14);

        // Table shadow
        this.add.rectangle(tableX + 6, tableY + 6, tableW + 60, tableH + 60, 0x000000, 0.5);

        // Rail (outer border)
        this.add.rectangle(tableX, tableY, tableW + 60, tableH + 60, 0x3b1f0a);

        // Rail inner bevel
        this.add.rectangle(tableX, tableY, tableW + 44, tableH + 44, 0x5c3010);

        // Felt surface
        this.add.rectangle(tableX, tableY, tableW, tableH, 0x0f5c2e);

        // Felt lines/texture overlay
        const felt = this.add.graphics();
        felt.lineStyle(1, 0x0d5028, 0.4);
        for (let x = tableX - tableW / 2; x <= tableX + tableW / 2; x += 20) {
          felt.lineBetween(x, tableY - tableH / 2, x, tableY + tableH / 2);
        }

        // Table bounds for physics
        const left = tableX - tableW / 2;
        const right = tableX + tableW / 2;
        const top = tableY - tableH / 2;
        const bottom = tableY + tableH / 2;

        // Invisible walls
        this.physics.world.setBounds(left, top, tableW, tableH);

        // Pocket positions
        const pr = 22;
        this.pockets = [
          { x: left + pr, y: top + pr },
          { x: tableX, y: top - 4 },
          { x: right - pr, y: top + pr },
          { x: left + pr, y: bottom - pr },
          { x: tableX, y: bottom + 4 },
          { x: right - pr, y: bottom - pr },
        ];

        // Draw pockets
        this.pockets.forEach(({ x, y }) => {
          this.add.circle(x, y, pr + 4, 0x000000);
          this.add.circle(x, y, pr, 0x111111);
          // Pocket ring
          const ring = this.add.graphics();
          ring.lineStyle(2, 0x3b1f0a, 0.8);
          ring.strokeCircle(x, y, pr + 2);
        });

        // Ball colors (solid 1-7, 8-ball, stripe 9-15)
        const ballColors = [
          0xf5c842, // 1 yellow
          0x1a3fcc, // 2 blue
          0xd42020, // 3 red
          0x7b1fa2, // 4 purple
          0xe65c00, // 5 orange
          0x2e7d32, // 6 green
          0x8d1515, // 7 maroon
          0x111111, // 8 black
          0xf5c842, // 9 yellow stripe
          0x1a3fcc, // 10 blue stripe
          0xd42020, // 11 red stripe
          0x7b1fa2, // 12 purple stripe
          0xe65c00, // 13 orange stripe
          0x2e7d32, // 14 green stripe
          0x8d1515, // 15 maroon stripe
        ];

        // Generate textures
        this.generateCueBallTexture();
        ballColors.forEach((color, i) => {
          this.generateBallTexture(`ball${i + 1}`, color, i + 1);
        });

        // Cue ball
        this.cueBall = this.physics.add.image(left + tableW * 0.27, tableY, "cueBall");
        this.cueBall.setCircle(13, 0, 0);
        this.cueBall.setBounce(0.78);
        this.cueBall.setCollideWorldBounds(true);
        this.cueBall.setDamping(true);
        this.cueBall.setDrag(0.97);
        this.cueBall.ballNumber = 0;

        // Rack 15 balls in triangle
        this.balls = [];
        const rackX = left + tableW * 0.67;
        const rackY = tableY;
        const bSpacing = 27;

        // Triangle order with 8-ball in center
        const rackOrder = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
        let idx = 0;
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col <= row; col++) {
            const bx = rackX + row * bSpacing * 0.866;
            const by = rackY + (col - row / 2) * bSpacing;
            const num = rackOrder[idx];
            const ball = this.physics.add.image(bx, by, `ball${num}`);
            ball.setCircle(13, 0, 0);
            ball.setBounce(0.78);
            ball.setCollideWorldBounds(true);
            ball.setDamping(true);
            ball.setDrag(0.97);
            ball.ballNumber = num;
            this.balls.push(ball);
            idx++;
          }
        }

        // Colliders
        this.physics.add.collider(this.cueBall, this.balls);
        for (let i = 0; i < this.balls.length; i++) {
          for (let j = i + 1; j < this.balls.length; j++) {
            this.physics.add.collider(this.balls[i], this.balls[j]);
          }
        }

        // Aim graphics
        this.aimGraphics = this.add.graphics();
        this.cueStick = this.add.graphics();

        // Input
        this.input.on("pointerdown", this.onPointerDown, this);
        this.input.on("pointermove", this.onPointerMove, this);
        this.input.on("pointerup", this.onPointerUp, this);

        // Particle emitter for pocketing
        this.sparkGraphics = this.add.graphics();
      }

      onPointerDown(pointer) {
        if (this.ballsMoving || this.shotFired) return;
        this.isDragging = true;
        this.dragStart = { x: pointer.x, y: pointer.y };
      }

      onPointerMove(pointer) {
        if (!this.isDragging || this.ballsMoving) return;
        const dx = this.cueBall.x - pointer.x;
        const dy = this.cueBall.y - pointer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.power = Math.min(dist / 2, 100);

        // Update UI
        setGameState(s => ({ ...s, power: Math.round(this.power) }));

        this.drawAim(pointer);
      }

      onPointerUp(pointer) {
        if (!this.isDragging || this.ballsMoving) return;
        this.isDragging = false;

        const dx = this.cueBall.x - pointer.x;
        const dy = this.cueBall.y - pointer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5) {
          this.aimGraphics.clear();
          this.cueStick.clear();
          return;
        }

        const speed = Math.min(dist * 4.5, 900);
        const angle = Math.atan2(dy, dx);
        this.cueBall.setVelocity(
          Math.cos(angle) * speed,
          Math.sin(angle) * speed
        );

        this.shotFired = true;
        this.ballsMoving = true;
        this.aimGraphics.clear();
        this.cueStick.clear();
        setGameState(s => ({
          ...s,
          power: 0,
          shooting: true,
          message: "Ball in motion…"
        }));
      }

      drawAim(pointer) {
        this.aimGraphics.clear();
        this.cueStick.clear();

        const cx = this.cueBall.x;
        const cy = this.cueBall.y;
        const dx = cx - pointer.x;
        const dy = cy - pointer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const nx = dx / dist;
        const ny = dy / dist;

        // Aim dotted line
        this.aimGraphics.lineStyle(1.5, 0xffffff, 0.5);
        for (let i = 0; i < 8; i++) {
          const s = cx + nx * (20 + i * 25);
          const e = cx + nx * (35 + i * 25);
          const sy2 = cy + ny * (20 + i * 25);
          const ey2 = cy + ny * (35 + i * 25);
          this.aimGraphics.lineBetween(s, sy2, e, ey2);
        }

        // Power color
        const t = this.power / 100;
        const r = Math.round(255 * t);
        const g2 = Math.round(255 * (1 - t));
        const powerColor = (r << 16) | (g2 << 8);

        // Cue stick
        const cueOffset = 18 + this.power * 0.3;
        const cueLen = 130;
        const cueStartX = cx - nx * cueOffset;
        const cueStartY = cy - ny * cueOffset;
        const cueEndX = cx - nx * (cueOffset + cueLen);
        const cueEndY = cy - ny * (cueOffset + cueLen);

        this.cueStick.lineStyle(6, 0xd4a017, 0.9);
        this.cueStick.lineBetween(cueStartX, cueStartY, cueEndX - nx * 40, cueEndY - ny * 40);
        this.cueStick.lineStyle(10, 0x8B4513, 0.9);
        this.cueStick.lineBetween(cueEndX - nx * 40, cueEndY - ny * 40, cueEndX, cueEndY);

        // Power dot on cue ball
        this.aimGraphics.fillStyle(powerColor, 0.8);
        this.aimGraphics.fillCircle(cx, cy, 5 + this.power * 0.1);
      }

      checkBallsStopped() {
        const allBalls = [this.cueBall, ...this.balls].filter(b => b.active);
        return allBalls.every(b => {
          const vx = b.body ? b.body.velocity.x : 0;
          const vy = b.body ? b.body.velocity.y : 0;
          return Math.abs(vx) < 3 && Math.abs(vy) < 3;
        });
      }

      update() {
        if (!this.ballsMoving) return;

        // Force-apply friction
        const allActive = [this.cueBall, ...this.balls].filter(b => b.active);
        allActive.forEach(b => {
          if (b.body) {
            b.body.velocity.x *= 0.993;
            b.body.velocity.y *= 0.993;
          }
        });

        // Check pockets
        [...this.balls].forEach(ball => {
          if (!ball.active) return;
          this.pockets.forEach(({ x, y }) => {
            const d = Phaser.Math.Distance.Between(ball.x, ball.y, x, y);
            if (d < 24) {
              this.pocketBall(ball);
            }
          });
        });

        // Cue ball pocket
        if (this.cueBall.active) {
          this.pockets.forEach(({ x, y }) => {
            const d = Phaser.Math.Distance.Between(this.cueBall.x, this.cueBall.y, x, y);
            if (d < 24) {
              this.scratchBall();
            }
          });
        }

        if (this.checkBallsStopped() && this.shotFired) {
          this.shotFired = false;
          this.ballsMoving = false;
          this.switchTurn();
        }
      }

      pocketBall(ball) {
        ball.disableBody(true, true);
        this.scores[this.currentPlayer] = (this.scores[this.currentPlayer] || 0) + 1;

        setGameState(s => ({
          ...s,
          p1Score: this.scores[1],
          p2Score: this.scores[2],
          message: `Player ${this.currentPlayer} pocketed ball ${ball.ballNumber}! 🎱`,
        }));

        // Check 8-ball
        if (ball.ballNumber === 8) {
          const winner = this.currentPlayer;
          setGameState(s => ({
            ...s,
            winner,
            message: `🏆 Player ${winner} wins by pocketing the 8-ball!`,
          }));
          this.ballsMoving = false;
          this.shotFired = false;
        }
      }

      scratchBall() {
        this.cueBall.disableBody(true, true);
        setGameState(s => ({
          ...s,
          message: `Scratch! Player ${this.currentPlayer === 1 ? 2 : 1} gets ball-in-hand.`,
        }));

        // Respawn cue ball after delay
        this.time.delayedCall(800, () => {
          const left = 500 - 430;
          this.cueBall.enableBody(true, left + 200, 300, true, true);
          this.cueBall.setVelocity(0, 0);
          this.ballsMoving = false;
          this.shotFired = false;
          this.switchTurn(true);
        });
      }

      switchTurn(keepPlayer = false) {
        if (!keepPlayer) {
          this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        }
        setGameState(s => ({
          ...s,
          turn: this.currentPlayer,
          shooting: false,
          message: `Player ${this.currentPlayer}'s Turn — Aim and shoot!`,
        }));
      }
    }

    const config = {
      type: Phaser.AUTO,
      width: 1000,
      height: 600,
      parent: "pool-container",
      backgroundColor: "#0d0d14",
      physics: {
        default: "arcade",
        arcade: { debug: false, gravity: { x: 0, y: 0 } },
      },
      scene: PoolScene,
    };

    gameRef.current = new Phaser.Game(config);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  const resetGame = () => {
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    }
    setGameState({
      turn: 1, p1Score: 0, p2Score: 0,
      message: "Player 1's Turn — Click & drag to aim",
      power: 0, shooting: false, winner: null,
    });
    setTimeout(() => {
      // Re-trigger effect by forcing remount — handled by key prop trick
      window.location.reload();
    }, 100);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a12 0%, #12101e 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Georgia', serif",
      padding: "20px",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        marginBottom: "16px",
      }}>
        <span style={{ fontSize: "2rem" }}>🎱</span>
        <h1 style={{
          margin: 0,
          fontSize: "2rem",
          fontWeight: "bold",
          letterSpacing: "3px",
          color: "#e8c97a",
          textShadow: "0 0 20px rgba(232,201,122,0.4)",
          textTransform: "uppercase",
        }}>
          TheCueArena
        </h1>
        <span style={{ fontSize: "2rem" }}>🎱</span>
      </div>

      {/* Scoreboard */}
      <div style={{
        display: "flex",
        gap: "24px",
        marginBottom: "12px",
        alignItems: "center",
      }}>
        {[1, 2].map(p => (
          <div key={p} style={{
            background: gameState.turn === p && !gameState.winner
              ? "linear-gradient(135deg, #1a3a1a, #0f5c2e)"
              : "rgba(255,255,255,0.05)",
            border: gameState.turn === p && !gameState.winner
              ? "2px solid #4ade80"
              : "2px solid rgba(255,255,255,0.1)",
            borderRadius: "12px",
            padding: "10px 24px",
            textAlign: "center",
            transition: "all 0.3s ease",
            minWidth: "100px",
          }}>
            <div style={{ color: "#aaa", fontSize: "0.75rem", letterSpacing: "2px", marginBottom: "4px" }}>
              PLAYER {p}
            </div>
            <div style={{
              color: gameState.turn === p ? "#4ade80" : "#e8c97a",
              fontSize: "2rem",
              fontWeight: "bold",
              lineHeight: 1,
            }}>
              {p === 1 ? gameState.p1Score : gameState.p2Score}
            </div>
          </div>
        ))}

        {/* Power meter */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "4px",
        }}>
          <div style={{ color: "#aaa", fontSize: "0.7rem", letterSpacing: "2px" }}>POWER</div>
          <div style={{
            width: "120px",
            height: "12px",
            background: "rgba(255,255,255,0.1)",
            borderRadius: "6px",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.15)",
          }}>
            <div style={{
              width: `${gameState.power}%`,
              height: "100%",
              background: `linear-gradient(90deg, #22c55e, ${gameState.power > 70 ? "#ef4444" : gameState.power > 40 ? "#f59e0b" : "#22c55e"})`,
              transition: "width 0.05s",
              borderRadius: "6px",
            }} />
          </div>
          <div style={{ color: "#e8c97a", fontSize: "0.8rem" }}>{gameState.power}%</div>
        </div>
      </div>

      {/* Status message */}
      <div style={{
        marginBottom: "10px",
        padding: "8px 20px",
        background: "rgba(255,255,255,0.05)",
        borderRadius: "8px",
        border: "1px solid rgba(255,255,255,0.1)",
        color: gameState.winner ? "#fbbf24" : "#e2e8f0",
        fontSize: "0.9rem",
        letterSpacing: "0.5px",
        textAlign: "center",
        minWidth: "360px",
      }}>
        {gameState.message}
      </div>

      {/* Game canvas */}
      <div style={{
        borderRadius: "16px",
        overflow: "hidden",
        boxShadow: "0 0 60px rgba(0,0,0,0.8), 0 0 20px rgba(232,201,122,0.1)",
        border: "2px solid rgba(232,201,122,0.2)",
      }}>
        <div id="pool-container" />
      </div>

      {/* Controls hint */}
      <div style={{
        marginTop: "12px",
        display: "flex",
        gap: "24px",
        color: "#555",
        fontSize: "0.75rem",
        letterSpacing: "1px",
      }}>
        <span>🖱️ CLICK & DRAG from cue ball to aim</span>
        <span>⬆️ FARTHER = MORE POWER</span>
        <span>🎯 RELEASE to shoot</span>
      </div>

      {/* Winner overlay / Reset */}
      {gameState.winner && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.75)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
        }}>
          <div style={{
            background: "linear-gradient(135deg, #1a1a2e, #16213e)",
            border: "2px solid #e8c97a",
            borderRadius: "20px",
            padding: "48px 64px",
            textAlign: "center",
            boxShadow: "0 0 80px rgba(232,201,122,0.3)",
          }}>
            <div style={{ fontSize: "4rem", marginBottom: "16px" }}>🏆</div>
            <h2 style={{ color: "#e8c97a", fontSize: "2.5rem", margin: "0 0 8px", letterSpacing: "2px" }}>
              PLAYER {gameState.winner} WINS!
            </h2>
            <p style={{ color: "#aaa", marginBottom: "32px" }}>
              Final Score — P1: {gameState.p1Score} | P2: {gameState.p2Score}
            </p>
            <button onClick={resetGame} style={{
              background: "linear-gradient(135deg, #e8c97a, #c9a227)",
              color: "#1a1a2e",
              border: "none",
              borderRadius: "10px",
              padding: "14px 40px",
              fontSize: "1.1rem",
              fontWeight: "bold",
              cursor: "pointer",
              letterSpacing: "2px",
              textTransform: "uppercase",
            }}>
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
