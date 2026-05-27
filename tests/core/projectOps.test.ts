import { describe, expect, it } from 'vitest';
import { addAnnotation, deleteAnnotation, findAdjacentReviewFrame, updateAnnotation } from '../../src/shared/projectOps';
import type { Project } from '../../src/shared/types';

const baseProject: Project = {
  id: 'p1',
  name: 'Ops',
  createdAt: '2026-05-26T00:00:00.000Z',
  updatedAt: '2026-05-26T00:00:00.000Z',
  classes: [{ id: 'class-object', name: 'object', color: '#c96442' }],
  media: [
    {
      id: 'm1',
      name: 'video.mp4',
      path: 'video.mp4',
      type: 'video',
      annotationNamePrefix: 'video',
      width: 100,
      height: 100,
      frames: [
        { id: 'f1', mediaId: 'm1', index: 0, timestampMs: 0, imagePath: 'f1.jpg', reviewState: 'reviewed', annotations: [] },
        { id: 'f2', mediaId: 'm1', index: 1, timestampMs: 40, imagePath: 'f2.jpg', reviewState: 'unreviewed_ai', annotations: [] }
      ]
    }
  ],
  settings: { pythonPath: 'python', modelPath: '', ffmpegPath: 'ffmpeg', confidenceThreshold: 0.25 },
  exportHistory: []
};

describe('project operations', () => {
  it('adds, updates, and deletes annotations immutably', () => {
    const added = addAnnotation(baseProject, 'f1', {
      name: 'video_000001_01',
      classId: 'class-object',
      bbox: { x: 1, y: 2, width: 30, height: 40 },
      source: 'manual'
    });
    const annotationId = added.media[0].frames[0].annotations[0].id;
    const updated = updateAnnotation(added, annotationId, { name: 'edited_name', bbox: { x: 5, y: 6, width: 20, height: 10 } });
    const deleted = deleteAnnotation(updated, annotationId);

    expect(baseProject.media[0].frames[0].annotations).toHaveLength(0);
    expect(added.media[0].frames[0].annotations[0].name).toBe('video_000001_01');
    expect(updated.media[0].frames[0].annotations[0].name).toBe('edited_name');
    expect(updated.media[0].frames[0].annotations[0].bbox.x).toBe(5);
    expect(deleted.media[0].frames[0].annotations).toHaveLength(0);
  });

  it('finds adjacent frames that still need review', () => {
    expect(findAdjacentReviewFrame(baseProject, 'f1', 'next')?.id).toBe('f2');
    expect(findAdjacentReviewFrame(baseProject, 'f2', 'previous')).toBeUndefined();
  });
});
