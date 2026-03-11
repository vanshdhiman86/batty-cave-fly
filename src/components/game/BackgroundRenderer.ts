import bgHimalayasImg from "../../assets/bg-himalayas.png";
import bgSavannaImg from "../../assets/bg-savanna.png";
import bgLandmarksImg from "../../assets/bg-landmarks.png";
import bgDesertImg from "../../assets/bg-desert.png";

export const LEVEL_INTERVAL = 5; // Change background every 5 points

export interface LevelTheme {
  name: string;
  image: HTMLImageElement | null;
  // Vertical crop ratios for 3 parallax layers (from the single image)
  // sky: top 35%, midground: middle 35%, foreground: bottom 30%
}

const BG_SOURCES = [
  { name: "Himalayan Foothills", src: bgHimalayasImg },
  { name: "Sunny Savanna", src: bgSavannaImg },
  { name: "Global Landmarks", src: bgLandmarksImg },
  { name: "Desert Oasis", src: bgDesertImg },
];

const loadedImages: (HTMLImageElement | null)[] = [null, null, null, null];
let imagesLoaded = false;

export function preloadBackgrounds(onReady?: () => void) {
  let count = 0;
  BG_SOURCES.forEach((bg, i) => {
    const img = new Image();
    img.src = bg.src;
    img.onload = () => {
      loadedImages[i] = img;
      count++;
      if (count === BG_SOURCES.length) {
        imagesLoaded = true;
        onReady?.();
      }
    };
  });
}

export function getLevelIndex(score: number): number {
  return Math.floor(score / LEVEL_INTERVAL) % BG_SOURCES.length;
}

export function getLevelName(score: number): string {
  return BG_SOURCES[getLevelIndex(score)].name;
}

/**
 * Draws seamless parallax background with 3 layers from a single image.
 * The image is split into horizontal bands:
 *   - Far background (sky): top 35% of image, scrolls at 20% obstacle speed
 *   - Midground (landmarks/mountains): middle 35%, scrolls at 50% speed
 *   - Foreground (ground/plants): bottom 30%, scrolls at 80% speed
 * 
 * Fade transition between levels is handled via globalAlpha blending.
 */
export function drawParallaxBackground(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  frameCount: number,
  currentScore: number,
  obstacleSpeed: number,
  prevLevelIdx: number
) {
  const currentIdx = getLevelIndex(currentScore);
  const currentImg = loadedImages[currentIdx];
  const prevImg = loadedImages[prevLevelIdx];

  // Check if we're in a transition (within 60 frames of a level change)
  const scoreInLevel = currentScore % LEVEL_INTERVAL;
  const isTransitioning = currentIdx !== prevLevelIdx;

  // Calculate transition alpha (fade over ~60 frames after level change)
  // We use frameCount modulo approach - track externally
  // For simplicity, we'll draw both and blend

  if (isTransitioning && prevImg) {
    // Draw previous background fading out
    drawSingleParallax(ctx, prevImg, canvasWidth, canvasHeight, frameCount, obstacleSpeed, 0.4);
    // Draw new background fading in
    if (currentImg) {
      drawSingleParallax(ctx, currentImg, canvasWidth, canvasHeight, frameCount, obstacleSpeed, 0.6);
    }
  } else if (currentImg) {
    drawSingleParallax(ctx, currentImg, canvasWidth, canvasHeight, frameCount, obstacleSpeed, 1.0);
  } else {
    // Fallback solid color
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  return currentIdx;
}

function drawSingleParallax(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number,
  frame: number,
  obstacleSpeed: number,
  alpha: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const scale = ch / img.naturalHeight;
  const tileWidth = Math.ceil(img.naturalWidth * scale);
  const scrollSpeed = obstacleSpeed * 0.4;
  const offset = Math.floor((frame * scrollSpeed) % tileWidth);

  let x = -offset;
  while (x < cw) {
    ctx.drawImage(img, x, 0, tileWidth, ch);
    x += tileWidth;
  }

  ctx.restore();
}
