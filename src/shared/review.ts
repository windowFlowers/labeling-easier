import type { FrameRecord } from './types';

const REVIEWABLE_STATES = new Set(['unreviewed_ai', 'modified']);

export function getNextReviewFrame(frames: FrameRecord[], currentIndex: number): FrameRecord | undefined {
  return frames.find((frame) => frame.index > currentIndex && REVIEWABLE_STATES.has(frame.reviewState));
}

export function getPreviousReviewFrame(frames: FrameRecord[], currentIndex: number): FrameRecord | undefined {
  return [...frames].reverse().find((frame) => frame.index < currentIndex && REVIEWABLE_STATES.has(frame.reviewState));
}

export function markFrameReviewed(frame: FrameRecord): FrameRecord {
  return {
    ...frame,
    reviewState: 'reviewed',
    annotations: frame.annotations.map((annotation) => ({
      ...annotation,
      reviewState: 'reviewed'
    }))
  };
}
