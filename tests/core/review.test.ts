import { describe, expect, it } from 'vitest';
import { getNextReviewFrame, markFrameReviewed } from '../../src/shared/review';
import type { FrameRecord } from '../../src/shared/types';

const frames: FrameRecord[] = [
  { id: 'f1', mediaId: 'm1', index: 0, timestampMs: 0, imagePath: 'a.jpg', reviewState: 'reviewed', annotations: [] },
  { id: 'f2', mediaId: 'm1', index: 1, timestampMs: 40, imagePath: 'b.jpg', reviewState: 'unreviewed_ai', annotations: [] },
  { id: 'f3', mediaId: 'm1', index: 2, timestampMs: 80, imagePath: 'c.jpg', reviewState: 'modified', annotations: [] }
];

describe('review workflow helpers', () => {
  it('finds the next AI-generated frame that needs review', () => {
    expect(getNextReviewFrame(frames, 0)?.id).toBe('f2');
    expect(getNextReviewFrame(frames, 1)?.id).toBe('f3');
  });

  it('marks a frame and its annotations as reviewed', () => {
    const reviewed = markFrameReviewed({
      ...frames[1],
      annotations: [
        {
          id: 'a1',
          name: 'b_000002_01',
          frameId: 'f2',
          classId: 'class-drone',
          bbox: { x: 1, y: 1, width: 10, height: 10 },
          source: 'ai',
          reviewState: 'unreviewed_ai',
          updatedAt: '2026-05-26T00:00:00.000Z'
        }
      ]
    });

    expect(reviewed.reviewState).toBe('reviewed');
    expect(reviewed.annotations[0].reviewState).toBe('reviewed');
  });
});
