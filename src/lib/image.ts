// Client-side photo preparation for Tier-3 photo logging: decode whatever
// the camera hands us (JPEG/PNG/HEIC — Safari decodes HEIC natively), resize
// to a vision-friendly size and re-encode as JPEG base64. Keeps uploads
// ~100–300 KB, far under the serverless 4.5 MB body limit, and keeps the
// Claude vision token cost low (~1k tokens per image).

const MAX_SIDE = 1024;
const JPEG_QUALITY = 0.8;

export interface PreparedImage {
  base64: string; // raw base64, no data: prefix
  mime: 'image/jpeg';
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const base64 = dataUrl.split(',')[1] ?? '';
    if (!base64) throw new Error('encode');
    return { base64, mime: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode'));
    img.src = url;
  });
}
