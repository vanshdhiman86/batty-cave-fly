import { useEffect, useRef, useState, useCallback } from "react";
import { playFlap, playScore, playGameOver, startBgMusic, stopBgMusic } from "./game/AudioManager";
import { preloadBackgrounds, drawParallaxBackground, getLevelIndex, getLevelName, LEVEL_INTERVAL } from "./game/BackgroundRenderer";
import modiBatImg from "../assets/modi-bat.png";
import kejriwalImg from "../assets/kejriwal.png";
import rahulImg from "../assets/rahul.png";
import trumpImg from "../assets/trump.png";

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const GRAVITY = 0.45;
const JUMP_FORCE = -7.5;
const PIPE_WIDTH = 60;
const MIN_PIPE_GAP = 140;
const MAX_PIPE_GAP = 280;
const TIGHT_GAP_CHANCE = 0.6;
const PIPE_SPEED = 2.5;
const PIPE_INTERVAL = 180;

const ENEMY_IMAGES = [kejriwalImg, rahulImg, trumpImg];

interface Pipe {
  x: number;
  topHeight: number;
  pipeGap: number;
  scored: boolean;
  enemyIndex: number;
  enemyIndex2: number;
}

const FlappyBatGame = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>(0);
  const modiImgRef = useRef<HTMLImageElement | null>(null);
  const enemyImgsRef = useRef<HTMLImageElement[]>([]);
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<"idle" | "playing" | "over">("idle");
  const prevLevelIdxRef = useRef(0);
  const bgReadyRef = useRef(false);

  const stateRef = useRef({
    batY: CANVAS_HEIGHT / 2,
    batVelocity: 0,
    pipes: [] as Pipe[],
    frameCount: 0,
    score: 0,
    wingFrame: 0,
    lastLevelScore: -1,
  });

  // Preload all images
  useEffect(() => {
    const img = new Image();
    img.src = modiBatImg;
    img.onload = () => { modiImgRef.current = img; };

    ENEMY_IMAGES.forEach((src, i) => {
      const eImg = new Image();
      eImg.src = src;
      eImg.onload = () => { enemyImgsRef.current[i] = eImg; };
    });

    preloadBackgrounds(() => { bgReadyRef.current = true; });
  }, []);

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

    // Pillar
    ctx.fillStyle = "rgba(80, 60, 40, 0.35)";
    if (fromTop) {
      ctx.fillRect(x + 10, 0, PIPE_WIDTH - 20, height - spriteSize / 2);
    } else {
      ctx.fillRect(x + 10, CANVAS_HEIGHT - height + spriteSize / 2, PIPE_WIDTH - 20, height - spriteSize / 2);
    }

    // Circular sprite
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

    // Track level transitions
    const newLevelIdx = getLevelIndex(s.score);
    if (s.score !== s.lastLevelScore && s.score > 0 && s.score % LEVEL_INTERVAL === 0) {
      // Level just changed - keep previous for fade
      s.lastLevelScore = s.score;
      // prevLevelIdxRef will update after transition frames
      setTimeout(() => {
        prevLevelIdxRef.current = newLevelIdx;
      }, 1000);
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

      if (!s.pipes[i].scored && s.pipes[i].x + PIPE_WIDTH < batX) {
        s.pipes[i].scored = true;
        s.score++;
        setScore(s.score);
        playScore();
      }

      const p = s.pipes[i];
      const batRadius = 10;
      if (batX + batRadius > p.x && batX - batRadius < p.x + PIPE_WIDTH) {
        if (s.batY - batRadius < p.topHeight || s.batY + batRadius > p.topHeight + PIPE_GAP) {
          collided = true;
        }
      }
    }

    if (s.batY < 10 || s.batY > CANVAS_HEIGHT - 10) collided = true;

    if (collided) {
      playGameOver();
      stopBgMusic();
      setGameState("over");
      return;
    }

    // Draw parallax background (no hitbox interference - purely visual)
    drawParallaxBackground(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, s.frameCount, s.score, PIPE_SPEED, prevLevelIdxRef.current);

    // Draw obstacles on top
    s.pipes.forEach((p) => {
      drawEnemyObstacle(ctx, p.x, p.topHeight, true, p.enemyIndex);
      drawEnemyObstacle(ctx, p.x, CANVAS_HEIGHT - p.topHeight - PIPE_GAP, false, p.enemyIndex2);
    });

    drawBat(ctx, batX, s.batY, s.batVelocity);

    // Score display
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = "bold 36px monospace";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 8;
    ctx.fillText(String(s.score), CANVAS_WIDTH / 2, 50);
    ctx.shadowBlur = 0;

    // Level name indicator
    ctx.font = "12px monospace";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fillText(getLevelName(s.score), CANVAS_WIDTH / 2, 70);

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
      lastLevelScore: -1,
    };
    prevLevelIdxRef.current = 0;
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

  // Idle screen
  useEffect(() => {
    if (gameState !== "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawParallaxBackground(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, 0, 0, PIPE_SPEED, 0);
    drawBat(ctx, 80, CANVAS_HEIGHT / 2, 0);

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.font = "bold 32px monospace";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 10;
    ctx.fillText("NAMO FLY", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 3);
    ctx.shadowBlur = 0;
    ctx.font = "14px monospace";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
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
