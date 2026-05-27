import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createImportingVideoMedia,
  createImageMedia,
  createVideoMedia,
  createVideoFrameCacheDirectory,
  extractVideoFrames,
  extractVideoFramesWithProgress,
  listMediaFilesInDirectory,
  mediaTypeForPath,
  mediaUrlForPath
} from '../../src/main/services/mediaService';

describe('media service helpers', () => {
  it('detects image and video file types from paths', () => {
    expect(mediaTypeForPath('a.JPG')).toBe('image');
    expect(mediaTypeForPath('b.mp4')).toBe('video');
    expect(mediaTypeForPath('c.txt')).toBeUndefined();
  });

  it('creates image and video media records with frame records', () => {
    expect(createImageMedia('C:/data/a.jpg', 640, 480).frames[0].imagePath).toBe('C:/data/a.jpg');
    const video = createVideoMedia('C:/data/v.mp4', 1280, 720, 25, 80, ['f1.jpg', 'f2.jpg']);

    expect(video.type).toBe('video');
    expect(video.annotationNamePrefix).toBe('v');
    expect(video.frames).toHaveLength(2);
    expect(video.frames[1].timestampMs).toBe(40);
  });

  it('builds app media URLs for local file display', () => {
    expect(mediaUrlForPath('C:/data/frame 1.jpg')).toBe('labeling-easier-media://file/C%3A%2Fdata%2Fframe%201.jpg');
  });

  it('extracts every video frame without a sampling limit', async () => {
    const processRunner = vi.fn().mockResolvedValue(undefined);
    const root = path.join(tmpdir(), `labeling-easier-frames-${Date.now()}`);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'frame-000001.jpg'), '');
    await writeFile(path.join(root, 'frame-000002.jpg'), '');

    const frames = await extractVideoFrames('ffmpeg', 'C:/data/v.mp4', root, processRunner);

    expect(processRunner).toHaveBeenCalledWith(
      'ffmpeg',
      ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '0', '-i', 'C:/data/v.mp4', '-vsync', '0', '-q:v', '3', path.join(root, 'frame-%06d.jpg')]
    );
    expect(frames).toEqual([path.join(root, 'frame-000001.jpg'), path.join(root, 'frame-000002.jpg')]);
  });

  it('reports partial frame batches during progressive extraction', async () => {
    const root = path.join(tmpdir(), `labeling-easier-partial-${Date.now()}`);
    await mkdir(root, { recursive: true });
    const progress = vi.fn();
    const partial = vi.fn();
    const processRunner = vi.fn(async () => {
      await writeFile(path.join(root, 'frame-000001.jpg'), '');
      await writeFile(path.join(root, 'frame-000002.jpg'), '');
    });

    const frames = await extractVideoFramesWithProgress('ffmpeg', 'C:/data/v.mp4', root, 1000, progress, partial, processRunner);

    expect(processRunner).toHaveBeenCalledWith(
      'ffmpeg',
      ['-y', '-hide_banner', '-loglevel', 'error', '-threads', '0', '-i', 'C:/data/v.mp4', '-vsync', '0', '-q:v', '3', '-progress', 'pipe:1', path.join(root, 'frame-%06d.jpg')],
      1000,
      progress
    );
    expect(partial).toHaveBeenCalledWith([path.join(root, 'frame-000001.jpg'), path.join(root, 'frame-000002.jpg')]);
    expect(frames).toEqual([path.join(root, 'frame-000001.jpg'), path.join(root, 'frame-000002.jpg')]);
  });

  it('creates importing video records immediately while frame extraction runs', () => {
    const media = createImportingVideoMedia('C:/data/slow.mp4');

    expect(media.name).toBe('slow.mp4');
    expect(media.type).toBe('video');
    expect(media.importStatus).toBe('importing');
    expect(media.importProgress).toBe(0);
    expect(media.frames).toEqual([]);
  });

  it('creates stable per-video frame cache directories without unsafe path characters', () => {
    const cacheDir = createVideoFrameCacheDirectory('C:/cache-root', 'C:/data/nested/slow video.mp4', {
      size: 1024,
      mtimeMs: 12345
    });

    expect(cacheDir).toBe(path.join('C:/cache-root', 'C-data-nested-slow-video-mp4-1024-12345'));
  });

  it('finds supported media files in a selected folder', async () => {
    const root = path.join(tmpdir(), `labeling-easier-media-${Date.now()}`);
    await mkdir(path.join(root, 'nested'), { recursive: true });
    await writeFile(path.join(root, 'a.jpg'), '');
    await writeFile(path.join(root, 'notes.txt'), '');
    await writeFile(path.join(root, 'nested', 'b.mp4'), '');

    await expect(listMediaFilesInDirectory(root)).resolves.toEqual([
      path.join(root, 'a.jpg'),
      path.join(root, 'nested', 'b.mp4')
    ]);
  });
});
