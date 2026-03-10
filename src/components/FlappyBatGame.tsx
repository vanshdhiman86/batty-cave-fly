import { useEffect, useRef, useState, useCallback } from "react";
import { playFlap, playScore, playGameOver, startBgMusic, stopBgMusic } from "./game/AudioManager";
import modiBatImg from "../assets/modi-bat.png";
import kejriwalImg from "../assets/kejriwal.png";
import rahulImg from "../assets/rahul.png";
import trumpImg from "../assets/trump.png";

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const GRAVITY = 0.45;
const JUMP_FORCE = -7.5;
const PIPE_WIDTH = 60;
const PIPE_GAP = 150;
const PIPE_SPEED = 2.5;
const PIPE_INTERVAL = 180;
const OBSTACLE_SIZE = 55;

const ENEMY_IMAGES = [kejriwalImg, rahulImg, trumpImg];

// Landmark color palettes for dynamic backgrounds
const LANDMARKS = [
  { name: "Delhi", sky: ["#1a1a2e", "#16213e", "#0f3460"], ground: "#e94560", accent: "rgba(233,69,96,0.15)" },
  { name: "Paris", sky: ["#2d1b69", "#11052c", "#3c096c"], ground: "#f72585", accent: "rgba(247,37,133,0.12)" },
  { name: "Washington", sky: ["#0d1b2a", "#1b263b", "#415a77"], ground: "#778da9", accent: "rgba(119,141,169,0.1)" },
  { name: "Agra", sky: ["#1b0a2e", "#2d1459", "#4a1f7a"], ground: "#e0aaff", accent: "rgba(224,170,255,0.1)" },
  { name: "Beijing", sky: ["#2b0000", "#450a0a", "#7f1d1d"], ground: "#fca311", accent: "rgba(252,163,17,0.12)" },
  { name: "London", sky: ["#1a1a2e", "#2d3436", "#636e72"], ground: "#dfe6e9", accent: "rgba(223,230,233,0.08)" },
];

interface Pipe {
  x: number;
  topHeight: number;
  scored: boolean;
  enemyIndex: number; // which enemy sprite to use (top)
  enemyIndex2: number; // which enemy sprite for bottom
}

const FlappyBatGame = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>(0);
  const modiImgRef = useRef<HTMLImageElement | null>(null);
  const enemyImgsRef = useRef<HTMLImageElement[]>([]);
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<"idle" | "playing" | "over">("idle");
  const landmarkIndexRef = useRef(0);

  const stateRef = useRef({
    batY: CANVAS_HEIGHT / 2,
    batVelocity: 0,
    pipes: [] as Pipe[],
    frameCount: 0,
    score: 0,
    wingFrame: 0,
    lastLandmarkScore: 0,
  });

  // Preload images
  useEffect(() => {
    const img = new Image();
    img.src = modiBatImg;
    img.onload = () => { modiImgRef.current = img; };

    ENEMY_IMAGES.forEach((src, i) => {
      const eImg = new Image();
      eImg.src = src;
      eImg.onload = () => { enemyImgsRef.current[i] = eImg; };
    });
  }, []);

  const getLandmark = () => LANDMARKS[landmarkIndexRef.current % LANDMARKS.length];

  const drawLandmarkIcon = (ctx: CanvasRenderingContext2D, type: number, x: number, y: number, scale: number, color: string) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    switch (type % 4) {
      case 0: // Eiffel Tower
        ctx.moveTo(0, -30); ctx.lineTo(-8, 0); ctx.lineTo(-14, 30);
        ctx.lineTo(-6, 30); ctx.lineTo(-4, 15); ctx.lineTo(4, 15);
        ctx.lineTo(6, 30); ctx.lineTo(14, 30); ctx.lineTo(8, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillRect(-10, 8, 20, 2);
        ctx.fillRect(-6, -5, 12, 2);
        break;
      case 1: // Taj Mahal
        ctx.fillRect(-16, 10, 32, 20);
        ctx.arc(0, 0, 12, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -2, 6, Math.PI, 0); ctx.fill();
        ctx.fillRect(-1, -14, 2, 8);
        ctx.fillRect(-20, 12, 4, 18); ctx.fillRect(16, 12, 4, 18);
        break;
      case 2: // White House
        ctx.fillRect(-20, 5, 40, 25);
        ctx.moveTo(-22, 5); ctx.lineTo(0, -10); ctx.lineTo(22, 5); ctx.closePath(); ctx.fill();
        ctx.fillRect(-3, -10, 6, -8);
        for (let c = -14; c <= 14; c += 7) { ctx.fillRect(c - 1, 10, 2, 12); }
        break;
      case 3: // Tokyo Tower
        ctx.moveTo(0, -35); ctx.lineTo(-10, 30); ctx.lineTo(-6, 30);
        ctx.lineTo(-4, 10); ctx.lineTo(4, 10); ctx.lineTo(6, 30);
        ctx.lineTo(10, 30); ctx.closePath(); ctx.fill();
        ctx.fillRect(-8, 5, 16, 2);
        ctx.fillRect(-6, -10, 12, 2);
        ctx.fillRect(-1, -35, 2, -8);
        break;
    }
    ctx.restore();
  };

  const drawBackground = (ctx: CanvasRenderingContext2D, frame: number) => {
    const lm = getLandmark();
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    grad.addColorStop(0, lm.sky[0]);
    grad.addColorStop(0.5, lm.sky[1]);
    grad.addColorStop(1, lm.sky[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Scrolling landmark pattern (parallax - slower than pipes)
    const parallaxSpeed = 0.4;
    const spacing = 120;
    const rows = [
      { y: CANVAS_HEIGHT * 0.25, alpha: 0.06, s: 0.7 },
      { y: CANVAS_HEIGHT * 0.50, alpha: 0.09, s: 0.9 },
      { y: CANVAS_HEIGHT * 0.75, alpha: 0.12, s: 1.1 },
    ];
    const totalWidth = spacing * 4;

    for (const row of rows) {
      const offset = (frame * parallaxSpeed * row.s) % totalWidth;
      for (let i = -1; i < Math.ceil(CANVAS_WIDTH / spacing) + 2; i++) {
        const px = i * spacing - offset;
        const iconType = ((i % 4) + 4) % 4;
        const color = lm.accent.replace(/[\d.]+\)$/, `${row.alpha})`);
        drawLandmarkIcon(ctx, iconType, px, row.y + Math.sin(frame * 0.01 + i) * 4, row.s, color);
      }
    }

    // Floating particles
    ctx.fillStyle = lm.accent;
    for (let i = 0; i < 15; i++) {
      const px = ((i * 97 + frame * 0.3) % (CANVAS_WIDTH + 20)) - 10;
      const py = ((i * 53 + Math.sin(frame * 0.02 + i) * 20) % CANVAS_HEIGHT);
      ctx.beginPath();
      ctx.arc(px, py, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const drawBat = (ctx: CanvasRenderingContext2D, x: number, y: number, velocity: number) => {
    const rotation = Math.min(Math.max(velocity * 3, -30), 45) * (Math.PI / 180);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    const img = modiImgRef.current;
    const size = 70;
    if (img) {
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = "hsl(30, 80%, 50%)";
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  const drawEnemyObstacle = (ctx: CanvasRenderingContext2D, x: number, height: number, fromTop: boolean, enemyIdx: number) => {
    const img = enemyImgsRef.current[enemyIdx % 3];
    const spriteSize = 80;
    const centerX = x + PIPE_WIDTH / 2;
    const centerY = fromTop ? height - spriteSize / 2 : CANVAS_HEIGHT - height + spriteSize / 2;

    // Draw the pipe/pillar extending from wall to sprite
    const lm = getLandmark();
    ctx.fillStyle = lm.ground + "44";
    if (fromTop) {
      ctx.fillRect(x + 10, 0, PIPE_WIDTH - 20, height - spriteSize / 2);
    } else {
      ctx.fillRect(x + 10, CANVAS_HEIGHT - height + spriteSize / 2, PIPE_WIDTH - 20, height - spriteSize / 2);
    }

    // Circular clip for the sprite
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, spriteSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (img) {
      ctx.drawImage(img, centerX - spriteSize / 2, centerY - spriteSize / 2, spriteSize, spriteSize);
    } else {
      ctx.fillStyle = "hsl(0, 60%, 40%)";
      ctx.fill();
    }
    ctx.restore();

    // Glow ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, spriteSize / 2 + 2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 80, 80, 0.5)";
    ctx.lineWidth = 3;
    ctx.stroke();
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

    // Change landmark every 10 points
    if (s.score > 0 && s.score % 10 === 0 && s.score !== s.lastLandmarkScore) {
      s.lastLandmarkScore = s.score;
      landmarkIndexRef.current = (landmarkIndexRef.current + 1) % LANDMARKS.length;
    }

    // Pipes
    if (s.frameCount % PIPE_INTERVAL === 0) {
      const minTop = 60;
      const maxTop = CANVAS_HEIGHT - PIPE_GAP - 60;
      const topHeight = minTop + Math.random() * (maxTop - minTop);
      s.pipes.push({
        x: CANVAS_WIDTH,
        topHeight,
        scored: false,
        enemyIndex: Math.floor(Math.random() * 3),
        enemyIndex2: Math.floor(Math.random() * 3),
      });
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

      // Collision - rectangular for the enemy sprites
      const p = s.pipes[i];
      const batRadius = 10;
      if (batX + batRadius > p.x && batX - batRadius < p.x + PIPE_WIDTH) {
        if (s.batY - batRadius < p.topHeight || s.batY + batRadius > p.topHeight + PIPE_GAP) {
          collided = true;
        }
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
    drawBackground(ctx, s.frameCount);
    s.pipes.forEach((p) => {
      drawEnemyObstacle(ctx, p.x, p.topHeight, true, p.enemyIndex);
      drawEnemyObstacle(ctx, p.x, CANVAS_HEIGHT - p.topHeight - PIPE_GAP, false, p.enemyIndex2);
    });
    drawBat(ctx, batX, s.batY, s.batVelocity);

    // Score display
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

  const goHome = useCallback(() => {
    stopBgMusic();
    stateRef.current = {
      batY: CANVAS_HEIGHT / 2,
      batVelocity: 0,
      pipes: [],
      frameCount: 0,
      score: 0,
      wingFrame: 0,
      lastLandmarkScore: 0,
    };
    landmarkIndexRef.current = (landmarkIndexRef.current + 1) % LANDMARKS.length;
    setScore(0);
    setGameState("idle");
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
        if (gameState === "over") goHome();
        else jump();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [jump, goHome, gameState]);

  // Draw idle screen
  useEffect(() => {
    if (gameState !== "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawBackground(ctx, 0);
    drawBat(ctx, 80, CANVAS_HEIGHT / 2, 0);
    ctx.fillStyle = "hsl(40, 20%, 90%)";
    ctx.font = "bold 32px monospace";
    ctx.textAlign = "center";
    ctx.fillText("NAMO FLY", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 3);
    ctx.font = "14px monospace";
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
          onClick={() => (gameState === "over" ? goHome() : jump())}
        />
        {gameState === "over" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 rounded-lg backdrop-blur-sm">
            <h2 className="text-4xl font-bold text-primary font-mono mb-2">GAME OVER</h2>
            <p className="text-2xl text-foreground font-mono mb-6">Score: {score}</p>
            <button
              onClick={goHome}
              className="px-8 py-3 bg-primary text-primary-foreground font-mono font-bold rounded-lg hover:opacity-90 transition-opacity text-lg"
            >
              HOME
            </button>
          </div>
        )}
      </div>
      <p className="text-muted-foreground text-sm font-mono">Space / Tap to flap</p>
    </div>
  );
};

export default FlappyBatGame;
