import type { Bbox, YoloBox } from './types';

const PRECISION = 6;

function round(value: number): number {
  return Number(value.toFixed(PRECISION));
}

export function normalizeYoloBox(bbox: Bbox, imageWidth: number, imageHeight: number): YoloBox {
  assertPositiveDimensions(imageWidth, imageHeight);
  return {
    centerX: round((bbox.x + bbox.width / 2) / imageWidth),
    centerY: round((bbox.y + bbox.height / 2) / imageHeight),
    width: round(bbox.width / imageWidth),
    height: round(bbox.height / imageHeight)
  };
}

export function denormalizeYoloBox(box: YoloBox, imageWidth: number, imageHeight: number): Bbox {
  assertPositiveDimensions(imageWidth, imageHeight);
  const width = round(box.width * imageWidth);
  const height = round(box.height * imageHeight);
  return {
    x: round(box.centerX * imageWidth - width / 2),
    y: round(box.centerY * imageHeight - height / 2),
    width,
    height
  };
}

export function clampBbox(bbox: Bbox, imageWidth: number, imageHeight: number): Bbox {
  assertPositiveDimensions(imageWidth, imageHeight);
  const x = Math.max(0, Math.min(bbox.x, imageWidth));
  const y = Math.max(0, Math.min(bbox.y, imageHeight));
  const maxWidth = Math.max(0, imageWidth - x);
  const maxHeight = Math.max(0, imageHeight - y);
  return {
    x: round(x),
    y: round(y),
    width: round(Math.max(0, Math.min(bbox.width, maxWidth))),
    height: round(Math.max(0, Math.min(bbox.height, maxHeight)))
  };
}

export function validateBbox(
  bbox: Bbox,
  imageWidth: number,
  imageHeight: number
): { valid: boolean; reason?: string } {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { valid: false, reason: 'Image dimensions must be positive.' };
  }
  if (bbox.width <= 0 || bbox.height <= 0) {
    return { valid: false, reason: 'Box width and height must be positive.' };
  }
  if (bbox.x < 0 || bbox.y < 0 || bbox.x + bbox.width > imageWidth || bbox.y + bbox.height > imageHeight) {
    return { valid: false, reason: 'Box must stay inside image bounds.' };
  }
  return { valid: true };
}

function assertPositiveDimensions(imageWidth: number, imageHeight: number): void {
  if (imageWidth <= 0 || imageHeight <= 0) {
    throw new Error('Image dimensions must be positive.');
  }
}
