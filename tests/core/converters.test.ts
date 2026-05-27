import { describe, expect, it } from 'vitest';
import type { Project } from '../../src/shared/types';
import {
  exportCoco,
  exportLabelMe,
  exportVoc,
  exportYolo,
  importCoco,
  importLabelMe,
  importVoc,
  importYolo
} from '../../src/shared/converters';

const project: Project = {
  id: 'project-1',
  name: 'Drone Dataset',
  createdAt: '2026-05-26T00:00:00.000Z',
  updatedAt: '2026-05-26T00:00:00.000Z',
  classes: [
    { id: 'class-drone', name: 'drone', color: '#c96442' },
    { id: 'class-bird', name: 'bird', color: '#5e5d59' }
  ],
  media: [
    {
      id: 'media-1',
      name: 'frame001.jpg',
      path: 'C:/dataset/frame001.jpg',
      type: 'image',
      width: 100,
      height: 200,
      frames: [
        {
          id: 'frame-1',
          mediaId: 'media-1',
          index: 0,
          timestampMs: 0,
          imagePath: 'C:/dataset/frame001.jpg',
          reviewState: 'unreviewed_ai',
          annotations: [
            {
              id: 'ann-1',
              name: 'frame001_000001_01',
              frameId: 'frame-1',
              classId: 'class-drone',
              bbox: { x: 10, y: 20, width: 40, height: 30 },
              confidence: 0.91,
              source: 'ai',
              reviewState: 'unreviewed_ai',
              updatedAt: '2026-05-26T00:00:00.000Z'
            }
          ]
        }
      ]
    }
  ],
  settings: {
    pythonPath: 'python',
    modelPath: 'C:/models/yolo.pt',
    ffmpegPath: 'ffmpeg',
    confidenceThreshold: 0.25
  },
  exportHistory: []
};

describe('annotation format converters', () => {
  it('round-trips YOLO text through the canonical project model', () => {
    const files = exportYolo(project);
    const imported = importYolo({
      imagePath: 'C:/dataset/frame001.jpg',
      imageWidth: 100,
      imageHeight: 200,
      labelText: files[0].content,
      classNames: ['drone', 'bird']
    });

    expect(files[0].path).toBe('frame001.txt');
    expect(files[0].content.trim()).toBe('0 0.300000 0.175000 0.400000 0.150000');
    expect(files[0].content).not.toContain('frame001_000001_01');
    expect(imported.media[0].frames[0].annotations[0].bbox).toEqual({ x: 10, y: 20, width: 40, height: 30 });
    expect(imported.media[0].frames[0].annotations[0].name).toBe('frame001_000001_01');
    expect(imported.classes.map((item) => item.name)).toEqual(['drone', 'bird']);
  });

  it('round-trips COCO JSON through the canonical project model', () => {
    const coco = exportCoco(project);
    const imported = importCoco(coco);

    expect(coco.images[0].file_name).toBe('frame001.jpg');
    expect(coco.annotations[0].bbox).toEqual([10, 20, 40, 30]);
    expect(imported.media[0].frames[0].annotations[0].classId).toBe(imported.classes[0].id);
  });

  it('round-trips Pascal VOC XML through the canonical project model', () => {
    const files = exportVoc(project);
    const imported = importVoc(files[0].content);

    expect(files[0].path).toBe('frame001.xml');
    expect(files[0].content).toContain('<name>drone</name>');
    expect(imported.media[0].frames[0].annotations[0].bbox).toEqual({ x: 10, y: 20, width: 40, height: 30 });
  });

  it('round-trips LabelMe JSON through the canonical project model', () => {
    const files = exportLabelMe(project);
    const imported = importLabelMe(files[0]);

    expect(files[0].imagePath).toBe('frame001.jpg');
    expect(files[0].shapes[0].shape_type).toBe('rectangle');
    expect(imported.media[0].frames[0].annotations[0].source).toBe('imported');
  });
});
