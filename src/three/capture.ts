import type { Work } from '../../shared/types';

export interface ProductionCapture {
  /** The existing production renderer's canvas; the lab never registers here. */
  element: HTMLElement;
  getWork: () => Work | null | undefined;
  /** Render the actual model at its neutral work view and restore the live view. */
  capture: () => Promise<string | HTMLImageElement>;
}

interface CaptureEntry extends ProductionCapture {
  tail: Promise<void>;
}
const sources = new Map<symbol, CaptureEntry>();
const retryMessage = '三维作品图片暂时未能生成，请等画面稳定后再试一次。';

/** Fields that change the physical keepsake. Sharing consent and private
    feedback intentionally have no bearing on its visual identity. */
export function workCaptureKey(work: Work): string {
  return JSON.stringify([
    work.id, work.finish, work.title,
    work.arrangement?.tracks.A.notes ?? work.notes,
    work.arrangement?.tracks.B.notes ?? null,
    work.arrangement?.tempo ?? null,
    work.stamps?.A ?? 'sprout', work.stamps?.B ?? 'spark'
  ]);
}

/** Register once per mounted production scene, using a ref-backed getWork so
    title/finish/stamp edits cannot leave a stale export closure behind. */
export function registerProductionCapture(source: ProductionCapture): () => void {
  const token = Symbol('production-capture');
  const entry: CaptureEntry = { ...source, tail: Promise.resolve() };
  sources.set(token, entry);
  return () => {
    sources.delete(token);
    delete source.element.dataset.workCaptureSource;
    delete source.element.dataset.workCaptureWorkId;
  };
}

function deadline<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), 10_000);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

async function decodedImage(value: string | HTMLImageElement): Promise<HTMLImageElement> {
  let image: HTMLImageElement;
  if (typeof value === 'string') {
    // The registry accepts only local pixel results, never a remote image that
    // might taint the final card or replace the actual work with a stock image.
    if (!value.startsWith('data:image/png')) throw new Error(retryMessage);
    image = new Image();
    image.src = value;
  } else image = value;
  if (!image.complete || !image.naturalWidth) {
    await deadline(new Promise<void>((resolve, reject) => {
      const loaded = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error(retryMessage)); };
      const cleanup = () => { image.removeEventListener('load', loaded); image.removeEventListener('error', failed); };
      image.addEventListener('load', loaded, { once: true });
      image.addEventListener('error', failed, { once: true });
      if (image.complete) image.naturalWidth ? loaded() : failed();
    }), retryMessage);
  }
  if (!image.naturalWidth || !image.naturalHeight) throw new Error(retryMessage);
  return image;
}

function requireRenderedPixels(image: HTMLImageElement) {
  // Reading a small raster rejects cleared/black/transparent WebGL buffers.
  // This checks that a render exists; scene ownership verifies its work data.
  const probe = document.createElement('canvas'); probe.width = 40; probe.height = 30;
  const context = probe.getContext('2d');
  if (!context) throw new Error(retryMessage);
  context.drawImage(image, 0, 0, probe.width, probe.height);
  const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
  let visible = 0, varied = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] > 24) visible++;
    const difference = Math.abs(pixels[index] - pixels[0]) + Math.abs(pixels[index + 1] - pixels[1]) +
      Math.abs(pixels[index + 2] - pixels[2]) + Math.abs(pixels[index + 3] - pixels[3]);
    if (difference > 32) varied++;
  }
  if (visible < 16 || varied < 16) throw new Error('三维画面还没有绘制完整，请稍后再保存作品图片。');
}

/** Null means there is no active production WebGL renderer, allowing an
    explicitly labelled SVG fallback. A failed/mismatched 3D capture throws. */
export async function captureProductionWork(work: Work): Promise<HTMLImageElement | null> {
  const active = [...sources.values()].reverse().filter(source => source.element.isConnected);
  if (!active.length) return null;
  const key = workCaptureKey(work);
  const entry = active.find(source => {
    const current = source.getWork();
    return current && workCaptureKey(current) === key;
  });
  if (!entry) throw new Error('作品画面仍在同步名字、刻印或木色，请稍后再保存图片。');
  delete entry.element.dataset.workCaptureSource;
  delete entry.element.dataset.workCaptureWorkId;
  // Serialize captures on this one renderer. A second click cannot race the
  // first capture's temporary camera/visibility changes, even after a timeout.
  const operation = entry.tail.then(async () => {
    const current = entry.getWork();
    if (!entry.element.isConnected || !current || workCaptureKey(current) !== key) throw new Error(retryMessage);
    const image = await decodedImage(await entry.capture());
    const after = entry.getWork();
    if (!entry.element.isConnected || !after || workCaptureKey(after) !== key) throw new Error('作品刚刚有更新，请重新保存最新的音乐盒图片。');
    requireRenderedPixels(image);
    entry.element.dataset.workCaptureSource = '3d';
    entry.element.dataset.workCaptureWorkId = work.id;
    return image;
  });
  entry.tail = operation.then(() => undefined, () => undefined);
  try { return await deadline(operation, retryMessage); }
  catch (error) {
    if (error instanceof Error && /作品|三维|稍后|重试|保存/.test(error.message)) throw error;
    throw new Error(retryMessage);
  }
}
