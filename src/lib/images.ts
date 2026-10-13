/**
 * Prepares a photo for upload in the browser: decodes it (respecting the
 * camera orientation), scales it down and re-encodes it as WebP (or JPEG).
 * Re-encoding drops all EXIF metadata, including GPS location, before the
 * file leaves the device.
 */
export type PreparedImage = { blob: Blob; width: number; height: number; mime: 'image/webp' | 'image/jpeg' };

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

async function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

export async function prepareImage(file: File, maxDimension = 2000, quality = 0.84): Promise<PreparedImage> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(`${file.name}: please choose a JPG, PNG or WebP photo.`);
  }
  if (file.size > MAX_SOURCE_BYTES) throw new Error(`${file.name} is larger than 25 MB.`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`${file.name} could not be read as an image.`);
  }
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process this image.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let blob = await encode(canvas, 'image/webp', quality);
  let mime: PreparedImage['mime'] = 'image/webp';
  if (!blob || blob.type !== 'image/webp') {
    blob = await encode(canvas, 'image/jpeg', quality);
    mime = 'image/jpeg';
  }
  if (!blob) throw new Error('Your browser could not process this image.');
  return { blob, width, height, mime };
}
