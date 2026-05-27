import { contextBridge, ipcRenderer } from 'electron';
import type { AiWorkerEvent } from '../main/services/aiWorker';
import type { AdvancedModelName } from '../main/services/modelService';
import type { AddAnnotationInput } from '../shared/projectOps';
import type { Annotation, ExportWriteResult, LabelFormat, MediaItem, Project, SessionState } from '../shared/types';

export type MediaImportEvent =
  | { type: 'progress'; mediaId: string; progress: number }
  | { type: 'partial'; mediaId: string; media: MediaItem }
  | { type: 'done'; mediaId?: string; media: MediaItem }
  | { type: 'error'; mediaId: string; message: string };

const api = {
  createProject: (name: string): Promise<Project> => ipcRenderer.invoke('project.create', name),
  openProject: (): Promise<Project | undefined> => ipcRenderer.invoke('project.open'),
  newWindow: (): Promise<{ opened: boolean }> => ipcRenderer.invoke('window.new'),
  openFolder: (ffmpegPath: string, ffprobePath: string): Promise<Project | undefined> =>
    ipcRenderer.invoke('project.openFolder', ffmpegPath, ffprobePath),
  openFile: (ffmpegPath: string, ffprobePath: string): Promise<MediaItem[]> =>
    ipcRenderer.invoke('media.openFile', ffmpegPath, ffprobePath),
  saveProject: (project: Project): Promise<{ saved: boolean; path?: string }> => ipcRenderer.invoke('project.save', project),
  autoSaveProject: (project: Project): Promise<{ saved: boolean; path?: string }> => ipcRenderer.invoke('project.autosave', project),
  loadSessionState: (): Promise<SessionState | undefined> => ipcRenderer.invoke('session.load'),
  saveSessionState: (state: SessionState): Promise<{ saved: boolean; path?: string }> => ipcRenderer.invoke('session.save', state),
  mediaUrl: (filePath: string): string => `labeling-easier-media://file/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`,
  importImages: (): Promise<MediaItem[]> => ipcRenderer.invoke('media.importImages'),
  importVideos: (ffmpegPath: string, ffprobePath: string): Promise<MediaItem[]> =>
    ipcRenderer.invoke('media.importVideos', ffmpegPath, ffprobePath),
  importFolder: (ffmpegPath: string, ffprobePath: string): Promise<MediaItem[]> =>
    ipcRenderer.invoke('media.importFolder', ffmpegPath, ffprobePath),
  checkAi: (settings: Project['settings']): Promise<{ configured: boolean }> => ipcRenderer.invoke('ai.check', settings),
  runAi: (
    settings: Project['settings'],
    frames: Array<{ frameId: string; imagePath: string; mediaId: string; index: number }>
  ): Promise<{ started: boolean; reason?: string }> =>
    ipcRenderer.invoke('ai.run', settings, frames),
  cancelAi: (): Promise<{ cancelled: boolean }> => ipcRenderer.invoke('ai.cancel'),
  createAnnotation: (frameId: string, input: AddAnnotationInput): Promise<Project | undefined> =>
    ipcRenderer.invoke('annotation.create', frameId, input),
  updateAnnotation: (annotationId: string, patch: Partial<Pick<Annotation, 'name' | 'bbox' | 'classId' | 'reviewState'>>): Promise<Project | undefined> =>
    ipcRenderer.invoke('annotation.update', annotationId, patch),
  deleteAnnotation: (annotationId: string): Promise<Project | undefined> => ipcRenderer.invoke('annotation.delete', annotationId),
  nextReviewFrame: (frameId: string) => ipcRenderer.invoke('review.next', frameId),
  previousReviewFrame: (frameId: string) => ipcRenderer.invoke('review.previous', frameId),
  markReviewed: (frameId: string): Promise<Project | undefined> => ipcRenderer.invoke('review.markReviewed', frameId),
  exportRun: (project: Project, format: LabelFormat): Promise<unknown> => ipcRenderer.invoke('export.run', project, format),
  exportToDirectory: (project: Project, format: LabelFormat): Promise<ExportWriteResult> => ipcRenderer.invoke('export.toDirectory', project, format),
  importRun: (format: LabelFormat, payload: unknown): Promise<Project> => ipcRenderer.invoke('import.run', format, payload),
  convertRun: (project: Project, format: LabelFormat): Promise<unknown> => ipcRenderer.invoke('convert.run', project, format),
  openExternal: (url: string): Promise<{ opened: boolean }> => ipcRenderer.invoke('shell.openExternal', url),
  fileExists: (filePath: string): Promise<boolean> => ipcRenderer.invoke('file.exists', filePath),
  bundledModelPath: (): Promise<string> => ipcRenderer.invoke('model.bundledPath'),
  chooseModelFile: (): Promise<string | undefined> => ipcRenderer.invoke('model.chooseFile'),
  downloadModel: (model: AdvancedModelName): Promise<string> => ipcRenderer.invoke('model.download', model),
  onMediaImportEvent: (listener: (event: MediaImportEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: MediaImportEvent) => listener(payload);
    ipcRenderer.on('media.importEvent', handler);
    return () => ipcRenderer.off('media.importEvent', handler);
  },
  onAiEvent: (listener: (event: AiWorkerEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AiWorkerEvent) => listener(payload);
    ipcRenderer.on('ai.event', handler);
    return () => ipcRenderer.off('ai.event', handler);
  }
};

contextBridge.exposeInMainWorld('labelingEasier', api);

export type LabelingEasierApi = typeof api;
