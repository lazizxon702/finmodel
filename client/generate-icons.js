import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generate() {
  const svgPath = path.join(__dirname, 'public', 'icon.svg');
  const publicDir = path.join(__dirname, 'public');

  console.log('Generating PNG icons from icon.svg...');

  await sharp(svgPath)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));
  console.log('Created icon-192.png');

  await sharp(svgPath)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));
  console.log('Created icon-512.png');

  await sharp(svgPath)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Created apple-touch-icon.png');

  await sharp(svgPath)
    .resize(64, 64)
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));
  console.log('Created favicon.png');

  // Also copy to Android mipmap folders if present
  const resDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
  if (fs.existsSync(resDir)) {
    const mipmaps = [
      { folder: 'mipmap-mdpi', size: 48 },
      { folder: 'mipmap-hdpi', size: 72 },
      { folder: 'mipmap-xhdpi', size: 96 },
      { folder: 'mipmap-xxhdpi', size: 144 },
      { folder: 'mipmap-xxxhdpi', size: 192 },
    ];
    for (const m of mipmaps) {
      const targetDir = path.join(resDir, m.folder);
      if (fs.existsSync(targetDir)) {
        await sharp(svgPath)
          .resize(m.size, m.size)
          .png()
          .toFile(path.join(targetDir, 'ic_launcher.png'));
        await sharp(svgPath)
          .resize(m.size, m.size)
          .png()
          .toFile(path.join(targetDir, 'ic_launcher_round.png'));
      }
    }
    console.log('Updated Android mipmap app launcher icons!');
  }

  console.log('All icons generated successfully!');
}

generate().catch(console.error);
