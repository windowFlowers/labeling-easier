import { execFile, spawn } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { stableId } from '../../shared/ids';
import type { FrameRecord, MediaItem } from '../../shared/types';

const execFileAsync = promisify(execFile);
type ProgressCallback = (progress: number) => void;
type PartialFramesCallback = (framePaths: string[]) => void;
type ProcessRunner = (file: string, args: string[], durationMs?: number, onProgress?: ProgressCallback) => Promise<void>;
export interface VideoCacheMetadata {
  size: number;
  mtimeMs: number;
}
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.avi', '.mov', '.mkv', '.m4v']);

export function mediaTypeForPath(filePath: string): 'image' | 'video' | undefined {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return undefined;
}

export function mediaUrlForPath(filePath: string): string {
  return `labeling-easier-media://file/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`;
}

export async function listMediaFilesInDirectory(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const discovered = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) return listMediaFilesInDirectory(entryPath);
      if (entry.isFile() && mediaTypeForPath(entryPath)) return [entryPath];
      return [];
    })
  );

  return discovered.flat().sort((left, right) => left.localeCompare(right));
}

export function createImageMedia(filePath: string, width = 0, height = 0): MediaItem {
  const mediaId = stableId('media', [filePath]);
  const frame = createFrame(mediaId, filePath, 0, 0);
  return {
    id: mediaId,
    name: path.basename(filePath),
    path: filePath,
    type: 'image',
    importStatus: 'ready',
    importProgress: 100,
    annotationNamePrefix: basenameWithoutExt(filePath),
    width,
    height,
    frames: [frame]
  };
}

export function createImportingVideoMedia(filePath: string): MediaItem {
  const mediaId = stableId('media', [filePath]);
  return {
    id: mediaId,
    name: path.basename(filePath),
    path: filePath,
    type: 'video',
    importStatus: 'importing',
    importProgress: 0,
    annotationNamePrefix: basenameWithoutExt(filePath),
    width: 0,
    height: 0,
    frames: []
  };
}

export async function probeVideo(ffprobePath: string, videoPath: string): Promise<{
  width: number;
  height: number;
  fps: number;
  durationMs: number;
}> {
  const { stdout } = await execFileAsync(ffprobePath, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,r_frame_rate,duration',
    '-of',
    'json',
    videoPath
  ]);
  const parsed = JSON.parse(stdout) as {
    streams: Array<{ width: number; height: number; r_frame_rate: string; duration?: string }>;
  };
  const stream = parsed.streams[0];
  const fps = parseFps(stream.r_frame_rate);
  return {
    width: stream.width,
    height: stream.height,
    fps,
    durationMs: Math.round(Number(stream.duration ?? 0) * 1000)
  };
}

export async function extractVideoFrames(
  ffmpegPath: string,
  videoPath: string,
  cacheDir: string,
  processRunner: ProcessRunner = runProcess
): Promise<string[]> {
  await mkdir(cacheDir, { recursive: true });
  const outputPattern = path.join(cacheDir, 'frame-%06d.jpg');
  await processRunner(ffmpegPath, [...baseFfmpegArgs(videoPath), outputPattern]);
  return readFrameCache(cacheDir);
}

export async function extractVideoFramesWithProgress(
  ffmpegPath: string,
  videoPath: string,
  cacheDir: string,
  durationMs: number,
  onProgress: ProgressCallback,
  onPartial?: PartialFramesCallback,
  processRunner: ProcessRunner = runProcess
): Promise<string[]> {
  await mkdir(cacheDir, { recursive: true });
  const outputPattern = path.join(cacheDir, 'frame-%06d.jpg');
  let lastPartialCount = 0;
  const emitPartial = async () => {
    if (!onPartial) return;
    const framePaths = await readFrameCache(cacheDir);
    if (framePaths.length > lastPartialCount) {
      lastPartialCount = framePaths.length;
      onPartial(framePaths);
    }
  };
  const poll = onPartial ? setInterval(() => void emitPartial(), 500) : undefined;
  try {
    await processRunner(ffmpegPath, [...baseFfmpegArgs(videoPath), '-progress', 'pipe:1', outputPattern], durationMs, onProgress);
  } finally {
    if (poll) clearInterval(poll);
  }
  await emitPartial();
  onProgress(100);
  const framePaths = await readFrameCache(cacheDir);
  await markFrameCacheComplete(cacheDir, framePaths.length);
  return framePaths;
}

export function createVideoFrameCacheDirectory(cacheRoot: string, videoPath: string, metadata?: VideoCacheMetadata): string {
  const safePath = videoPath.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const suffix = metadata ? `-${metadata.size}-${Math.round(metadata.mtimeMs)}` : '';
  return path.join(cacheRoot, `${safePath}${suffix}`);
}

export async function getVideoCacheMetadata(videoPath: string): Promise<VideoCacheMetadata> {
  const info = await stat(videoPath);
  return { size: info.size, mtimeMs: Math.round(info.mtimeMs) };
}

export async function isFrameCacheComplete(cacheDir: string): Promise<boolean> {
  try {
    const marker = JSON.parse(await readFile(path.join(cacheDir, 'complete.json'), 'utf8')) as { frameCount?: number };
    const frames = await readFrameCache(cacheDir);
    return Boolean(marker.frameCount && frames.length >= marker.frameCount);
  } catch {
    return false;
  }
}

export async function readFrameCache(cacheDir: string): Promise<string[]> {
  try {
    const files = await readdir(cacheDir);
    return files
      .filter((file) => /^frame-\d+\.jpg$/i.test(file))
      .sort()
      .map((file) => path.join(cacheDir, file));
  } catch {
    return [];
  }
}

async function markFrameCacheComplete(cacheDir: string, frameCount: number): Promise<void> {
  await writeFile(path.join(cacheDir, 'complete.json'), JSON.stringify({ frameCount }, null, 2), 'utf8');
}

export function createVideoMedia(
  filePath: string,
  width: number,
  height: number,
  fps: number,
  durationMs: number,
  framePaths: string[]
): MediaItem {
  const mediaId = stableId('media', [filePath]);
  const frameRate = fps > 0 ? fps : 1;
  return {
    id: mediaId,
    name: path.basename(filePath),
    path: filePath,
    type: 'video',
    importStatus: 'ready',
    importProgress: 100,
    annotationNamePrefix: basenameWithoutExt(filePath),
    width,
    height,
    fps,
    durationMs,
    frames: framePaths.map((framePath, index) => createFrame(mediaId, framePath, index, Math.round((index / frameRate) * 1000)))
  };
}

function baseFfmpegArgs(videoPath: string): string[] {
  return ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '0', '-i', videoPath, '-vsync', '0', '-q:v', '3'];
}

function runProcess(executable: string, args: string[], durationMs = 0, onProgress?: ProgressCallback): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let settled = false;

    child.stdout?.on('data', (chunk: Buffer) => {
      if (!onProgress || durationMs <= 0) return;
      for (const line of chunk.toString().split(/\r?\n/)) {
        const match = line.match(/^out_time_ms=(\d+)/);
        if (!match) continue;
        const progress = Math.max(1, Math.min(99, Math.round((Number(match[1]) / 1000 / durationMs) * 100)));
        onProgress(progress);
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000);
    });

    child.on('error', (error) => {
      settled = true;
      reject(error);
    });

    child.on('close', (code) => {
      if (settled) return;
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${executable} exited with code ${code ?? 'unknown'}${stderr ? `: ${stderr}` : ''}`));
    });
  });
}

function basenameWithoutExt(filePath: string): string {
  const parsed = path.parse(filePath);
  return parsed.name || parsed.base;
}

function createFrame(mediaId: string, imagePath: string, index: number, timestampMs: number): FrameRecord {
  return {
    id: stableId('frame', [mediaId, index]),
    mediaId,
    index,
    timestampMs,
    imagePath,
    reviewState: 'reviewed',
    annotations: []
  };
}

function parseFps(value: string): number {
  const [numerator, denominator] = value.split('/').map(Number);
  if (!denominator) return numerator;
  return numerator / denominator;
}
