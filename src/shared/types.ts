export type MediaType = 'image' | 'video';
export type MediaImportStatus = 'ready' | 'importing' | 'error';
export type AnnotationSource = 'manual' | 'ai' | 'imported';
export type ReviewState = 'unreviewed_ai' | 'modified' | 'reviewed' | 'rejected';

export interface Bbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface YoloBox {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export interface LabelClass {
  id: string;
  name: string;
  color: string;
}

export interface Annotation {
  id: string;
  name: string;
  frameId: string;
  classId: string;
  bbox: Bbox;
  confidence?: number;
  source: AnnotationSource;
  reviewState: ReviewState;
  updatedAt: string;
}

export interface FrameRecord {
  id: string;
  mediaId: string;
  index: number;
  timestampMs: number;
  imagePath: string;
  reviewState: ReviewState;
  annotations: Annotation[];
}

export interface MediaItem {
  id: string;
  name: string;
  path: string;
  type: MediaType;
  importStatus?: MediaImportStatus;
  importProgress?: number;
  importError?: string;
  annotationNamePrefix?: string;
  width: number;
  height: number;
  fps?: number;
  durationMs?: number;
  frames: FrameRecord[];
}

export interface ProjectSettings {
  pythonPath: string;
  modelPath: string;
  ffmpegPath: string;
  confidenceThreshold: number;
  namingTemplate?: string;
  namingPreset?: NamingPreset;
  aiLabelMode?: AiLabelMode;
}

export interface ExportHistoryEntry {
  id: string;
  format: LabelFormat;
  outputPath: string;
  exportedAt: string;
}

export type LabelFormat = 'yolo' | 'coco' | 'voc' | 'labelme';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  classes: LabelClass[];
  media: MediaItem[];
  settings: ProjectSettings;
  exportHistory: ExportHistoryEntry[];
}

export interface ExportedTextFile {
  path: string;
  content: string;
}

export interface CocoDataset {
  images: Array<{
    id: number;
    file_name: string;
    width: number;
    height: number;
  }>;
  annotations: Array<{
    id: number;
    image_id: number;
    category_id: number;
    bbox: [number, number, number, number];
    area: number;
    iscrowd: 0;
    score?: number;
  }>;
  categories: Array<{
    id: number;
    name: string;
  }>;
}

export interface LabelMeShape {
  label: string;
  points: [[number, number], [number, number]];
  group_id: null;
  shape_type: 'rectangle';
  flags: Record<string, never>;
}

export interface LabelMeFile {
  version: string;
  flags: Record<string, never>;
  shapes: LabelMeShape[];
  imagePath: string;
  imageData: null;
  imageHeight: number;
  imageWidth: number;
}

export type AiLabelMode = 'ask' | 'overwrite' | 'emptyOnly' | 'unreviewedOnly';
export type NamingPreset = 'current' | 'compact' | 'shortFrame' | 'singleTarget' | 'frameOnly' | 'custom';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface SessionState {
  project?: Project;
  projectDirectory?: string;
  activeMediaId?: string;
  activeFrameId?: string;
  selectedAnnotationId?: string;
  zoom?: number;
  pan?: { x: number; y: number };
}

export interface ExportWriteResult {
  saved: boolean;
  outputPath?: string;
  fileCount?: number;
  format?: LabelFormat;
}
