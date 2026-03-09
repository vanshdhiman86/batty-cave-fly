import { useEffect, useRef, useState, useCallback } from "react";
import { playFlap, playScore, playGameOver, startBgMusic, stopBgMusic } from "./game/AudioManager";

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const BAT_SIZE = 30;
const GRAVITY = 0.45;
const JUMP_FORCE = -7.5;
const PIPE_WIDTH = 60;
const PIPE_GAP = 150;
const PIPE_SPEED = 2.5;
const PIPE_INTERVAL = 180;

interface Pipe {
  x: number;
  topHeight: number;
  scored: boolean;
}

const FlappyBatGame = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>(0);
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<"idle" | "playing" | "over">("idle");
  
  const stateRef = useRef({
    batY: CANVAS_HEIGHT / 2,
    batVelocity: 0,
    pipes: [] as Pipe[],
    frameCount: 0,
    score: 0,
    wingFrame: 0,
  });

  const drawBat = (ctx: CanvasRenderingContext2D, x: number, y: number, velocity: number, wingFrame: number) => {
    const rotation = Math.min(Math.max(velocity * 3, -30), 45) * (Math.PI / 180);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    // Body
    ctx.fillStyle = "hsl(270, 30%, 25%)";
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wings
    const wingAngle = Math.sin(wingFrame * 0.3) * 0.6;
    ctx.fillStyle = "hsl(270, 25%, 35%)";
    // Left wing
    ctx.beginPath();
    ctx.moveTo(-5, -2);
    ctx.quadraticCurveTo(-22, -18 + wingAngle * 15, -28, -5 + wingAngle * 10);
    ctx.quadraticCurveTo(-20, 5, -5, 3);
    ctx.fill();
    // Right wing
    ctx.beginPath();
    ctx.moveTo(5, -2);
    ctx.quadraticCurveTo(22, -18 + wingAngle * 15, 28, -5 + wingAngle * 10);
    ctx.quadraticCurveTo(20, 5, 5, 3);
    ctx.fill();

    // Ears
    ctx.fillStyle = "hsl(270, 30%, 25%)";
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    ctx.lineTo(-10, -18);
    ctx.lineTo(-2, -10);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(6, -8);
    ctx.lineTo(10, -18);
    ctx.lineTo(2, -10);
    ctx.fill();

    // Eyes
    ctx.fillStyle = "hsl(50, 100%, 60%)";
    ctx.beginPath();
    ctx.arc(-5, -3, 3, 0, Math.PI * 2);
    ctx.arc(5, -3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "hsl(0, 0%, 5%)";
    ctx.beginPath();
    ctx.arc(-5, -3, 1.5, 0, Math.PI * 2);
    ctx.arc(5, -3, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  const drawCaveBackground = (ctx: CanvasRenderingContext2D, frame: number) => {
    // Gradient background
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    grad.addColorStop(0, "hsl(240, 25%, 3%)");
    grad.addColorStop(0.5, "hsl(240, 18%, 8%)");
    grad.addColorStop(1, "hsl(240, 25%, 5%)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Subtle floating particles
    ctx.fillStyle = "rgba(255, 200, 100, 0.05)";
    for (let i = 0; i < 20; i++) {
      const px = ((i * 97 + frame * 0.3) % (CANVAS_WIDTH + 20)) - 10;
      const py = ((i * 53 + Math.sin(frame * 0.02 + i) * 20) % CANVAS_HEIGHT);
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const drawStalactite = (ctx: CanvasRenderingContext2D, x: number, height: number, fromTop: boolean) => {
    const y = fromTop ? 0 : CANVAS_HEIGHT;
    const dir = fromTop ? 1 : -1;

    // Main rock body
    const grad = ctx.createLinearGradient(x, y, x + PIPE_WIDTH, y + height * dir);
    grad.addColorStop(0, "hsl(30, 20%, 22%)");
    grad.addColorStop(0.5, "hsl(30, 15%, 28%)");
    grad.addColorStop(1, "hsl(30, 20%, 18%)");
    ctx.fillStyle = grad;

    ctx.beginPath();
    if (fromTop) {
      ctx.moveTo(x - 8, 0);
      ctx.lineTo(x + PIPE_WIDTH + 8, 0);
      ctx.lineTo(x + PIPE_WIDTH - 5, height * 0.7);
      ctx.quadraticCurveTo(x + PIPE_WIDTH / 2, height + 15, x + 5, height * 0.7);
      ctx.closePath();
    } else {
      ctx.moveTo(x - 8, CANVAS_HEIGHT);
      ctx.lineTo(x + PIPE_WIDTH + 8, CANVAS_HEIGHT);
      ctx.lineTo(x + PIPE_WIDTH - 5, CANVAS_HEIGHT - height * 0.7);
      ctx.quadraticCurveTo(x + PIPE_WIDTH / 2, CANVAS_HEIGHT - height - 15, x + 5, CANVAS_HEIGHT - height * 0.7);
      ctx.closePath();
    }
    ctx.fill();

    // Highlight edge
    ctx.strokeStyle = "hsla(30, 15%, 40%, 0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Drip details
    ctx.fillStyle = "hsla(200, 30%, 50%, 0.2)";
    if (fromTop) {
      ctx.beginPath();
      ctx.ellipse(x + PIPE_WIDTH / 2, height - 2, 3, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const s = stateRef.current;
    s.frameCount++;
    s.wingFrame++;

    // Physics
    s.batVelocity += GRAVITY;
    s.batY += s.batVelocity;

    // Pipes
    if (s.frameCount % PIPE_INTERVAL === 0) {
      const minTop = 60;
      const maxTop = CANVAS_HEIGHT - PIPE_GAP - 60;
      const topHeight = minTop + Math.random() * (maxTop - minTop);
      s.pipes.push({ x: CANVAS_WIDTH, topHeight, scored: false });
    }

    const batX = 80;
    let collided = false;

    for (let i = s.pipes.length - 1; i >= 0; i--) {
      s.pipes[i].x -= PIPE_SPEED;
      if (s.pipes[i].x < -PIPE_WIDTH - 10) {
        s.pipes.splice(i, 1);
        continue;
      }

      // Score
      if (!s.pipes[i].scored && s.pipes[i].x + PIPE_WIDTH < batX) {
        s.pipes[i].scored = true;
        s.score++;
        setScore(s.score);
        playScore();
      }

      // Collision - use tighter hitbox matching the visual stalactite shape
      const p = s.pipes[i];
      const pipeCenterX = p.x + PIPE_WIDTH / 2;
      
      // Stalactites taper to a point, so narrow the collision width near the tips
      const distFromTopTip = p.topHeight - s.batY;
      const distFromBottomTip = s.batY - (p.topHeight + PIPE_GAP);
      
      // Calculate effective pipe width at bat's Y position (narrower near tips)
      let inTopPipe = false;
      let inBottomPipe = false;
      
      if (s.batY - 8 < p.topHeight) {
        // How far into the top stalactite (0 = tip, 1 = base)
        const ratio = Math.min(1, (p.topHeight - (s.batY - 8)) / p.topHeight);
        const effectiveHalfWidth = (PIPE_WIDTH / 2 + 8) * Math.max(0.15, ratio * 0.85);
        if (batX + 10 > pipeCenterX - effectiveHalfWidth && batX - 10 < pipeCenterX + effectiveHalfWidth) {
          inTopPipe = true;
        }
      }
      
      if (s.batY + 8 > p.topHeight + PIPE_GAP) {
        const bottomHeight = CANVAS_HEIGHT - p.topHeight - PIPE_GAP;
        const ratio = Math.min(1, ((s.batY + 8) - (p.topHeight + PIPE_GAP)) / bottomHeight);
        const effectiveHalfWidth = (PIPE_WIDTH / 2 + 8) * Math.max(0.15, ratio * 0.85);
        if (batX + 10 > pipeCenterX - effectiveHalfWidth && batX - 10 < pipeCenterX + effectiveHalfWidth) {
          inBottomPipe = true;
        }
      }
      
      if (inTopPipe || inBottomPipe) {
        collided = true;
      }
    }

    // Bounds
    if (s.batY < 10 || s.batY > CANVAS_HEIGHT - 10) collided = true;

    if (collided) {
      playGameOver();
      stopBgMusic();
      setGameState("over");
      return;
    }

    // Draw
    drawCaveBackground(ctx, s.frameCount);
    s.pipes.forEach((p) => {
      drawStalactite(ctx, p.x, p.topHeight, true);
      drawStalactite(ctx, p.x, CANVAS_HEIGHT - p.topHeight - PIPE_GAP, false);
    });
    drawBat(ctx, batX, s.batY, s.batVelocity, s.wingFrame);

    // Score display on canvas
    ctx.fillStyle = "hsla(35, 80%, 55%, 0.9)";
    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.shadowColor = "hsla(35, 80%, 55%, 0.5)";
    ctx.shadowBlur = 15;
    ctx.fillText(String(s.score), CANVAS_WIDTH / 2, 50);
    ctx.shadowBlur = 0;

    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, []);

  const jump = useCallback(() => {
    if (gameState === "idle") {
      setGameState("playing");
      startBgMusic();
    }
    if (gameState === "over") return;
    stateRef.current.batVelocity = JUMP_FORCE;
    playFlap();
  }, [gameState]);

  const restart = useCallback(() => {
    stateRef.current = {
      batY: CANVAS_HEIGHT / 2,
      batVelocity: 0,
      pipes: [],
      frameCount: 0,
      score: 0,
      wingFrame: 0,
    };
    setScore(0);
    setGameState("playing");
  }, []);

  useEffect(() => {
    if (gameState === "playing") {
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    }
    return () => cancelAnimationFrame(gameLoopRef.current);
  }, [gameState, gameLoop]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (gameState === "over") restart();
        else jump();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [jump, restart, gameState]);

  // Draw idle screen
  useEffect(() => {
    if (gameState !== "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCaveBackground(ctx, 0);
    drawBat(ctx, 80, CANVAS_HEIGHT / 2, 0, 0);
    ctx.fillStyle = "hsl(40, 20%, 90%)";
    ctx.font = "bold 28px monospace";
    ctx.textAlign = "center";
    ctx.fillText("FLAPPY BAT", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 3);
    ctx.font = "16px monospace";
    ctx.fillStyle = "hsl(240, 10%, 55%)";
    ctx.fillText("Tap or press Space to fly", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 3 + 35);
  }, [gameState]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="rounded-lg border border-border cursor-pointer"
          onClick={() => (gameState === "over" ? restart() : jump())}
        />
        {gameState === "over" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 rounded-lg backdrop-blur-sm">
            <h2 className="text-4xl font-bold text-primary font-mono mb-2">GAME OVER</h2>
            <p className="text-2xl text-foreground font-mono mb-6">Score: {score}</p>
            <button
              onClick={restart}
              className="px-8 py-3 bg-primary text-primary-foreground font-mono font-bold rounded-lg hover:opacity-90 transition-opacity text-lg"
            >
              RESTART
            </button>
          </div>
        )}
      </div>
      <p className="text-muted-foreground text-sm font-mono">Space / Tap to flap</p>
    </div>
  );
};

export default FlappyBatGame;
