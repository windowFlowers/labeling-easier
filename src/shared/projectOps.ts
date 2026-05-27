import { nowIso, stableId } from './ids';
import { getNextReviewFrame, getPreviousReviewFrame, markFrameReviewed } from './review';
import type { Annotation, Bbox, Project } from './types';

export interface AddAnnotationInput {
  name: string;
  classId: string;
  bbox: Bbox;
  source: Annotation['source'];
  confidence?: number;
}

export function addAnnotation(project: Project, frameId: string, input: AddAnnotationInput): Project {
  const timestamp = nowIso();
  const annotation: Annotation = {
    id: stableId('ann', [frameId, input.classId, timestamp]),
    name: input.name,
    frameId,
    classId: input.classId,
    bbox: input.bbox,
    ...(input.confidence === undefined ? {} : { confidence: input.confidence }),
    source: input.source,
    reviewState: input.source === 'ai' ? 'unreviewed_ai' : 'modified',
    updatedAt: timestamp
  };
  return updateFrame(project, frameId, (frame) => ({
    ...frame,
    reviewState: annotation.reviewState,
    annotations: [...frame.annotations, annotation]
  }));
}

export function updateAnnotation(
  project: Project,
  annotationId: string,
  patch: Partial<Pick<Annotation, 'name' | 'bbox' | 'classId' | 'reviewState'>>
): Project {
  return {
    ...project,
    updatedAt: nowIso(),
    media: project.media.map((media) => ({
      ...media,
      frames: media.frames.map((frame) => ({
        ...frame,
        reviewState: frame.annotations.some((annotation) => annotation.id === annotationId) ? 'modified' : frame.reviewState,
        annotations: frame.annotations.map((annotation) =>
          annotation.id === annotationId
            ? {
                ...annotation,
                ...patch,
                reviewState: patch.reviewState ?? 'modified',
                updatedAt: nowIso()
              }
            : annotation
        )
      }))
    }))
  };
}

export function deleteAnnotation(project: Project, annotationId: string): Project {
  return {
    ...project,
    updatedAt: nowIso(),
    media: project.media.map((media) => ({
      ...media,
      frames: media.frames.map((frame) => ({
        ...frame,
        reviewState: frame.annotations.some((annotation) => annotation.id === annotationId) ? 'modified' : frame.reviewState,
        annotations: frame.annotations.filter((annotation) => annotation.id !== annotationId)
      }))
    }))
  };
}

export function markProjectFrameReviewed(project: Project, frameId: string): Project {
  return updateFrame(project, frameId, (frame) => markFrameReviewed(frame));
}

export function findAdjacentReviewFrame(project: Project, frameId: string, direction: 'next' | 'previous') {
  const frames = project.media.flatMap((media) => media.frames);
  const currentFrame = frames.find((frame) => frame.id === frameId);
  if (!currentFrame) return undefined;
  return direction === 'next'
    ? getNextReviewFrame(frames, currentFrame.index)
    : getPreviousReviewFrame(frames, currentFrame.index);
}

function updateFrame(project: Project, frameId: string, updater: (frame: Project['media'][number]['frames'][number]) => Project['media'][number]['frames'][number]): Project {
  return {
    ...project,
    updatedAt: nowIso(),
    media: project.media.map((media) => ({
      ...media,
      frames: media.frames.map((frame) => (frame.id === frameId ? updater(frame) : frame))
    }))
  };
}
