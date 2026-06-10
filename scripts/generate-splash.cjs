const Jimp = require("jimp");
const path = require("path");

const BG_COLOR = 0xFAFAF8FF; // #fafaf8
const LOGO_SRC = path.join(__dirname, "..", "public", "logos", "black-logo-transparent.png");
const RES_DIR = path.join(__dirname, "..", "android", "app", "src", "main", "res");

// Logo should be about 25% of the shortest dimension
const LOGO_RATIO = 0.25;

const PORTRAIT_SIZES = [
  { folder: "drawable", w: 480, h: 800 },
  { folder: "drawable-port-mdpi", w: 320, h: 480 },
  { folder: "drawable-port-hdpi", w: 480, h: 800 },
  { folder: "drawable-port-xhdpi", w: 720, h: 1280 },
  { folder: "drawable-port-xxhdpi", w: 960, h: 1600 },
  { folder: "drawable-port-xxxhdpi", w: 1280, h: 1920 },
];

const LANDSCAPE_SIZES = [
  { folder: "drawable-land-mdpi", w: 480, h: 320 },
  { folder: "drawable-land-hdpi", w: 800, h: 480 },
  { folder: "drawable-land-xhdpi", w: 1280, h: 720 },
  { folder: "drawable-land-xxhdpi", w: 1600, h: 960 },
  { folder: "drawable-land-xxxhdpi", w: 1920, h: 1280 },
];

async function generate() {
  const logo = await Jimp.read(LOGO_SRC);
  const allSizes = [...PORTRAIT_SIZES, ...LANDSCAPE_SIZES];

  for (const { folder, w, h } of allSizes) {
    const splash = new Jimp(w, h, BG_COLOR);
    const shortSide = Math.min(w, h);
    const logoSize = Math.round(shortSide * LOGO_RATIO);
    const resizedLogo = logo.clone().resize(logoSize, logoSize);
    const x = Math.round((w - logoSize) / 2);
    const y = Math.round((h - logoSize) / 2);
    splash.composite(resizedLogo, x, y);
    const outPath = path.join(RES_DIR, folder, "splash.png");
    await splash.writeAsync(outPath);
    console.log(`Generated: ${folder}/splash.png (${w}x${h}, logo ${logoSize}px)`);
  }
  console.log("\nAll splash screens generated!");
}

generate().catch(console.error);
