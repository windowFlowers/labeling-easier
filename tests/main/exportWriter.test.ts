import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeExportFiles } from '../../src/main/services/exportWriter';
import type { Project } from '../../src/shared/types';

function exportProjectFixture(): Project {
  return {
    id: 'project-export',
    name: 'Export Dataset',
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    classes: [{ id: 'class-drone', name: 'drone', color: '#c96442' }],
    media: [
      {
        id: 'media-1',
        name: 'frame001.jpg',
        path: 'C:/dataset/frame001.jpg',
        type: 'image',
        width: 100,
        height: 100,
        frames: [
          {
            id: 'frame-1',
            mediaId: 'media-1',
            index: 0,
            timestampMs: 0,
            imagePath: 'C:/dataset/frame001.jpg',
            reviewState: 'reviewed',
            annotations: [
              {
                id: 'ann-1',
                name: 'frame001_000001_01',
                frameId: 'frame-1',
                classId: 'class-drone',
                bbox: { x: 10, y: 10, width: 20, height: 30 },
                source: 'manual',
                reviewState: 'reviewed',
                updatedAt: '2026-05-26T00:00:00.000Z'
              }
            ]
          }
        ]
      }
    ],
    settings: { pythonPath: 'python', modelPath: '', ffmpegPath: 'ffmpeg', confidenceThreshold: 0.25 },
    exportHistory: []
  };
}

describe('export writer', () => {
  it('writes YOLO label files to the selected directory', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'labeling-easier-export-'));
    try {
      const result = await writeExportFiles(exportProjectFixture(), 'yolo', directory);

      expect(result).toEqual({ saved: true, outputPath: directory, fileCount: 1, format: 'yolo' });
      expect(await readFile(path.join(directory, 'frame001.txt'), 'utf8')).toContain('0 0.200000 0.250000');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('writes COCO as a single JSON file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'labeling-easier-export-'));
    try {
      const result = await writeExportFiles(exportProjectFixture(), 'coco', directory);

      expect(result.fileCount).toBe(1);
      const json = JSON.parse(await readFile(path.join(directory, 'coco.json'), 'utf8')) as { annotations: unknown[] };
      expect(json.annotations).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
