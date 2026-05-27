import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, protocol, type WebContents } from 'electron';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildAiWorkerArgs, AiWorkerSession, type AiWorkerEvent } from './services/aiWorker';
import {
  createImportingVideoMedia,
  createImageMedia,
  createVideoFrameCacheDirectory,
  createVideoMedia,
  extractVideoFrames,
  extractVideoFramesWithProgress,
  getVideoCacheMetadata,
  isFrameCacheComplete,
  listMediaFilesInDirectory,
  mediaUrlForPath,
  mediaTypeForPath,
  probeVideo,
  readFrameCache
} from './services/mediaService';
import { bundledModelPath, downloadAdvancedModel, type AdvancedModelName } from './services/modelService';
import { createEmptyProject, loadOrCreateProjectInDirectory, mergeProjectMedia, PROJECT_FILE_NAME, saveProjectToDirectory } from './services/projectStore';
import {
  exportCoco,
  exportLabelMe,
  exportVoc,
  exportYolo,
  importCoco,
  importLabelMe,
  importVoc,
  importYolo,
  type ImportYoloInput
} from '../shared/converters';
import {
  addAnnotation,
  deleteAnnotation,
  findAdjacentReviewFrame,
  markProjectFrameReviewed,
  updateAnnotation,
  type AddAnnotationInput
} from '../shared/projectOps';
import type { Annotation, CocoDataset, LabelFormat, LabelMeFile, MediaItem, Project } from '../shared/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | undefined;
let currentProject: Project | undefined;
let currentProjectPath: string | undefined;
let currentProjectDirectory: string | undefined;
let aiWorker = new AiWorkerSession();

function registerMediaProtocol(): void {
  protocol.handle('labeling-easier-media', (request) => {
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.pathname.replace(/^\//, ''));
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: '#f5f4ed',
    icon: path.join(app.getAppPath(), 'resources', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

function registerIpc(): void {
  ipcMain.handle('window.new', async () => {
    createWindow();
    return { opened: true };
  });

  ipcMain.handle('project.create', async (_event, name: string) => {
    currentProject = createEmptyProject(name || 'Untitled Dataset');
    currentProjectPath = undefined;
    currentProjectDirectory = undefined;
    return currentProject;
  });

  ipcMain.handle('project.open', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    const directoryPath = result.filePaths[0];
    if (result.canceled || !directoryPath) return undefined;
    currentProject = await loadOrCreateProjectInDirectory(directoryPath);
    currentProjectDirectory = directoryPath;
    currentProjectPath = path.join(directoryPath, PROJECT_FILE_NAME);
    return currentProject;
  });

  ipcMain.handle('project.openFolder', async (event, ffmpegPath: string, ffprobePath: string) => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    const directoryPath = result.filePaths[0];
    if (result.canceled || !directoryPath) return undefined;
    currentProject = await loadOrCreateProjectInDirectory(directoryPath);
    currentProjectDirectory = directoryPath;
    currentProjectPath = path.join(directoryPath, PROJECT_FILE_NAME);
    const discovered = await createMediaForPaths(
      await listMediaFilesInDirectory(directoryPath),
      ffmpegPath,
      ffprobePath,
      event.sender
    );
    currentProject = withDefaultModel(mergeProjectMedia(currentProject, discovered));
    return currentProject;
  });

  ipcMain.handle('project.save', async (_event, project: Project) => {
    if (!currentProjectDirectory) {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Choose project folder'
      });
      currentProjectDirectory = result.filePaths[0];
      currentProjectPath = currentProjectDirectory ? path.join(currentProjectDirectory, PROJECT_FILE_NAME) : undefined;
    }
    if (!currentProjectDirectory || !currentProjectPath) return { saved: false };
    currentProject = project;
    await saveProjectToDirectory(project, currentProjectDirectory);
    return { saved: true, path: currentProjectPath };
  });

  ipcMain.handle('project.autosave', async (_event, project: Project) => {
    if (!currentProjectDirectory) return { saved: false };
    currentProject = project;
    await saveProjectToDirectory(project, currentProjectDirectory);
    return { saved: true, path: path.join(currentProjectDirectory, PROJECT_FILE_NAME) };
  });

  ipcMain.handle('media.importImages', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp'] }]
    });
    if (result.canceled) return [];
    return result.filePaths.filter((filePath) => mediaTypeForPath(filePath) === 'image').map((filePath) => {
      const size = nativeImage.createFromPath(filePath).getSize();
      return createImageMedia(filePath, size.width, size.height);
    });
  });

  ipcMain.handle('media.openFile', async (event, ffmpegPath: string, ffprobePath: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp', 'mp4', 'avi', 'mov', 'mkv', 'm4v'] }
      ]
    });
    if (result.canceled) return [];
    return createMediaForPaths(result.filePaths, ffmpegPath, ffprobePath, event.sender);
  });

  ipcMain.handle('media.importVideos', async (_event, ffmpegPath: string, ffprobePath: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'avi', 'mov', 'mkv', 'm4v'] }]
    });
    if (result.canceled) return [];
    const cacheRoot = path.join(app.getPath('userData'), 'frame-cache');
    await mkdir(cacheRoot, { recursive: true });
    const imported = [];
    for (const filePath of result.filePaths.filter((candidate) => mediaTypeForPath(candidate) === 'video')) {
      const info = await probeVideo(ffprobePath, filePath);
      const cacheDir = createVideoFrameCacheDirectory(cacheRoot, filePath, await getVideoCacheMetadata(filePath));
      const framePaths = await extractVideoFrames(ffmpegPath, filePath, cacheDir);
      imported.push(createVideoMedia(filePath, info.width, info.height, info.fps, info.durationMs, framePaths));
    }
    return imported;
  });

  ipcMain.handle('media.importFolder', async (_event, ffmpegPath: string, ffprobePath: string) => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return [];

    const filePaths = await listMediaFilesInDirectory(result.filePaths[0]);
    const cacheRoot = path.join(app.getPath('userData'), 'frame-cache');
    const imported: MediaItem[] = [];

    for (const filePath of filePaths) {
      const mediaType = mediaTypeForPath(filePath);
      if (mediaType === 'image') {
        const size = nativeImage.createFromPath(filePath).getSize();
        imported.push(createImageMedia(filePath, size.width, size.height));
      }

      if (mediaType === 'video') {
        await mkdir(cacheRoot, { recursive: true });
        const info = await probeVideo(ffprobePath, filePath);
        const cacheDir = createVideoFrameCacheDirectory(cacheRoot, filePath, await getVideoCacheMetadata(filePath));
        const framePaths = await extractVideoFrames(ffmpegPath, filePath, cacheDir);
        imported.push(createVideoMedia(filePath, info.width, info.height, info.fps, info.durationMs, framePaths));
      }
    }

    return imported;
  });

  ipcMain.handle('annotation.create', async (_event, frameId: string, input: AddAnnotationInput) => {
    if (!currentProject) return undefined;
    currentProject = addAnnotation(currentProject, frameId, input);
    return currentProject;
  });

  ipcMain.handle('annotation.update', async (_event, annotationId: string, patch: Partial<Pick<Annotation, 'name' | 'bbox' | 'classId' | 'reviewState'>>) => {
    if (!currentProject) return undefined;
    currentProject = updateAnnotation(currentProject, annotationId, patch);
    return currentProject;
  });

  ipcMain.handle('annotation.delete', async (_event, annotationId: string) => {
    if (!currentProject) return undefined;
    currentProject = deleteAnnotation(currentProject, annotationId);
    return currentProject;
  });

  ipcMain.handle('review.next', async (_event, frameId: string) => {
    if (!currentProject) return undefined;
    return findAdjacentReviewFrame(currentProject, frameId, 'next');
  });

  ipcMain.handle('review.previous', async (_event, frameId: string) => {
    if (!currentProject) return undefined;
    return findAdjacentReviewFrame(currentProject, frameId, 'previous');
  });

  ipcMain.handle('review.markReviewed', async (_event, frameId: string) => {
    if (!currentProject) return undefined;
    currentProject = markProjectFrameReviewed(currentProject, frameId);
    return currentProject;
  });

  ipcMain.handle('ai.check', async (_event, settings: Project['settings']) => ({
    pythonPath: settings.pythonPath,
    modelPath: settings.modelPath,
    ffmpegPath: settings.ffmpegPath,
    configured: Boolean(settings.pythonPath && settings.modelPath && settings.ffmpegPath)
  }));

  ipcMain.handle(
    'ai.run',
    async (
      ipcEvent,
      settings: Project['settings'],
      frames: Array<{ frameId: string; imagePath: string; mediaId: string; index: number }>
    ) => {
      if (!settings.modelPath) return { started: false, reason: 'No AI model selected.' };
      const workerScriptPath = app.isPackaged
        ? path.join(process.resourcesPath, 'ai_worker.py')
        : path.join(app.getAppPath(), 'scripts', 'ai_worker.py');
      const events: AiWorkerEvent[] = [];
      aiWorker.start(
        settings.pythonPath,
        buildAiWorkerArgs({
          workerScriptPath,
          modelPath: settings.modelPath,
          confidenceThreshold: settings.confidenceThreshold,
          device: 'auto'
        }),
        (workerEvent) => {
          events.push(workerEvent);
          ipcEvent.sender.send('ai.event', workerEvent);
        }
      );
      aiWorker.run({ frames: frames.map((frame) => ({ frameId: frame.frameId, imagePath: frame.imagePath })) });
      return { started: true, events };
    }
  );

  ipcMain.handle('ai.cancel', async () => {
    aiWorker.cancel();
    return { cancelled: true };
  });

  ipcMain.handle('media.url', async (_event, filePath: string) => mediaUrlForPath(filePath));
  ipcMain.handle('model.bundledPath', async () => bundledModelPath(modelResourceRoot()));
  ipcMain.handle('model.chooseFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'YOLO model', extensions: ['pt', 'onnx'] }]
    });
    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle('model.download', async (_event, model: AdvancedModelName) => downloadAdvancedModel(model, app.getPath('userData')));
  ipcMain.handle('export.run', async (_event, project: Project, format: LabelFormat) => exportProject(project, format));
  ipcMain.handle('convert.run', async (_event, project: Project, format: LabelFormat) => exportProject(project, format));
  ipcMain.handle('import.run', async (_event, format: LabelFormat, payload: unknown) => importProject(format, payload));
}

async function createMediaForPaths(
  filePaths: string[],
  ffmpegPath: string,
  ffprobePath: string,
  webContents: WebContents
): Promise<MediaItem[]> {
  const cacheRoot = path.join(app.getPath('userData'), 'frame-cache');
  const media: MediaItem[] = [];
  for (const filePath of filePaths.filter((candidate) => mediaTypeForPath(candidate))) {
    const mediaType = mediaTypeForPath(filePath);
    if (mediaType === 'image') {
      const size = nativeImage.createFromPath(filePath).getSize();
      media.push(createImageMedia(filePath, size.width, size.height));
    }
    if (mediaType === 'video') {
      await mkdir(cacheRoot, { recursive: true });
      const placeholder = createImportingVideoMedia(filePath);
      media.push(placeholder);
      void importVideoInBackground(placeholder.id, filePath, ffmpegPath, ffprobePath, cacheRoot, webContents);
    }
  }
  return media;
}

async function importVideoInBackground(
  mediaId: string,
  filePath: string,
  ffmpegPath: string,
  ffprobePath: string,
  cacheRoot: string,
  webContents: WebContents
): Promise<void> {
  try {
    const info = await probeVideo(ffprobePath, filePath);
    const cacheDir = createVideoFrameCacheDirectory(cacheRoot, filePath, await getVideoCacheMetadata(filePath));
    const cachedFramePaths = await readFrameCache(cacheDir);
    if (cachedFramePaths.length) {
      const cachedMedia = {
        ...createVideoMedia(filePath, info.width, info.height, info.fps, info.durationMs, cachedFramePaths),
        importStatus: 'importing' as const,
        importProgress: 1
      };
      webContents.send('media.importEvent', { type: 'partial', mediaId, media: cachedMedia });
    }
    if (await isFrameCacheComplete(cacheDir)) {
      const media = createVideoMedia(filePath, info.width, info.height, info.fps, info.durationMs, cachedFramePaths);
      webContents.send('media.importEvent', { type: 'done', mediaId, media });
      return;
    }
    const framePaths = await extractVideoFramesWithProgress(ffmpegPath, filePath, cacheDir, info.durationMs, (progress) => {
      webContents.send('media.importEvent', { type: 'progress', mediaId, progress });
    }, (partialFramePaths) => {
      const media = {
        ...createVideoMedia(filePath, info.width, info.height, info.fps, info.durationMs, partialFramePaths),
        importStatus: 'importing' as const
      };
      webContents.send('media.importEvent', { type: 'partial', mediaId, media });
    });
    const media = createVideoMedia(filePath, info.width, info.height, info.fps, info.durationMs, framePaths);
    webContents.send('media.importEvent', { type: 'done', mediaId, media });
  } catch (error) {
    webContents.send('media.importEvent', { type: 'error', mediaId, message: (error as Error).message });
  }
}

function withDefaultModel(project: Project): Project {
  if (project.settings.modelPath) return project;
  return {
    ...project,
    settings: {
      ...project.settings,
      modelPath: bundledModelPath(modelResourceRoot())
    }
  };
}

function modelResourceRoot(): string {
  return app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources');
}

function exportProject(project: Project, format: LabelFormat) {
  switch (format) {
    case 'yolo':
      return exportYolo(project);
    case 'coco':
      return exportCoco(project);
    case 'voc':
      return exportVoc(project);
    case 'labelme':
      return exportLabelMe(project);
  }
}

function importProject(format: LabelFormat, payload: unknown): Project {
  switch (format) {
    case 'yolo':
      return importYolo(payload as ImportYoloInput);
    case 'coco':
      return importCoco(payload as CocoDataset);
    case 'voc':
      return importVoc(String(payload));
    case 'labelme':
      return importLabelMe(payload as LabelMeFile);
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.labelingeasier.app');
  Menu.setApplicationMenu(null);
  registerMediaProtocol();
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
