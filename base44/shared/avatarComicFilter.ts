import jimp from "npm:jimp";

const OUTPUT_SIZE = 400;

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export async function applyComicFilterToAvatarFile(
  file: File,
  fileName = "avatar.jpg",
) {
  const input = new Uint8Array(await file.arrayBuffer());
  const image = await jimp.read(input);

  const side = Math.min(image.bitmap.width, image.bitmap.height);
  const x = image.bitmap.width > image.bitmap.height
    ? Math.floor((image.bitmap.width - side) / 2)
    : 0;
  const y = image.bitmap.height > image.bitmap.width
    ? Math.floor((image.bitmap.height - side) / 2)
    : 0;

  image.crop({ x, y, w: side, h: side });
  image.resize({ w: OUTPUT_SIZE, h: OUTPUT_SIZE });

  const { width, height, data } = image.bitmap;
  const gray = new Uint8ClampedArray(width * height);
  const edges = new Uint8ClampedArray(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  for (let py = 1; py < height - 1; py++) {
    for (let px = 1; px < width - 1; px++) {
      const i = py * width + px;
      const gx =
        -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1] +
        gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
      const gy =
        -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] +
        gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      edges[i] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }

  const levels = 5;
  const step = 255 / (levels - 1);
  const contrast = 1.35;
  const sat = 1.4;

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    let r = (data[i] - 128) * contrast + 128;
    let g = (data[i + 1] - 128) * contrast + 128;
    let b = (data[i + 2] - 128) * contrast + 128;

    const lum = r * 0.3 + g * 0.59 + b * 0.11;
    r = lum + (r - lum) * sat;
    g = lum + (g - lum) * sat;
    b = lum + (b - lum) * sat;

    r = Math.round(Math.max(0, Math.min(255, r)) / step) * step;
    g = Math.round(Math.max(0, Math.min(255, g)) / step) * step;
    b = Math.round(Math.max(0, Math.min(255, b)) / step) * step;

    const e = edges[p];
    if (e > 60) {
      const blend = Math.min(1, e / 180);
      r = r * (1 - blend);
      g = g * (1 - blend);
      b = b * (1 - blend);
    }

    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(b);
  }

  const out = await image.getBuffer("image/jpeg", { quality: 92 });
  return new File([out], fileName, { type: "image/jpeg" });
}
