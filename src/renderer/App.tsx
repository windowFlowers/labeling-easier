import {
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  File,
  FolderOpen,
  Keyboard,
  Minus,
  Plus,
  RotateCcw,
  Settings as SettingsIcon,
  Square,
  Trash2,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent, WheelEvent } from 'react';
import type { AiDetection, AiWorkerEvent } from '../main/services/aiWorker';
import { exportCoco, exportLabelMe, exportVoc, exportYolo } from '../shared/converters';
import { nowIso, stableId } from '../shared/ids';
import { markFrameReviewed } from '../shared/review';
import type { Annotation, Bbox, FrameRecord, LabelClass, LabelFormat, MediaItem, Project } from '../shared/types';
import type { MediaImportEvent } from '../preload/preload';

type ToolMode = 'select' | 'draw';
type ResizeHandle = 'tl' | 'tr' | 'br' | 'bl' | 't' | 'r' | 'b' | 'l';
type CanvasDrag =
  | { type: 'draw'; origin: Point }
  | { type: 'pan'; startClient: Point; initialPan: Point }
  | { type: 'move'; annotationId: string; start: Point; initial: Bbox }
  | { type: 'resize'; annotationId: string; handle: ResizeHandle; initial: Bbox };
type Point = { x: number; y: number };
type HistoryEntry = {
  project: Project;
  activeMediaId: string;
  activeFrameId: string;
  selectedAnnotationId: string;
};
type Language = 'en' | 'zh';
type Theme = 'light' | 'dark';
type SettingsTab = 'general' | 'appearance' | 'shortcuts';
type ShortcutAction =
  | 'draw'
  | 'previousFrame'
  | 'nextFrame'
  | 'copyPrevious'
  | 'undo'
  | 'zoomIn'
  | 'zoomOut'
  | 'markReviewed'
  | 'deleteBox';
type ShortcutMap = Record<ShortcutAction, string>;

const EXPORT_OPTIONS: Array<{ value: LabelFormat; label: string }> = [
  { value: 'yolo', label: 'YOLO txt' },
  { value: 'coco', label: 'COCO JSON' },
  { value: 'voc', label: 'Pascal VOC' },
  { value: 'labelme', label: 'LabelMe JSON' }
];

const DEFAULT_CLASSES: LabelClass[] = [{ id: 'class-object', name: 'object', color: '#c96442' }];
const CLASS_COLORS = ['#c96442', '#5e5d59', '#3898ec', '#6a9955', '#b57f2a', '#8f5ad7'];
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 8;
const LANGUAGE_STORAGE_KEY = 'labeling-easier.language';
const SHORTCUT_STORAGE_KEY = 'labeling-easier.shortcuts';
const THEME_STORAGE_KEY = 'labeling-easier.theme';
const AUTO_REVIEW_STORAGE_KEY = 'labeling-easier.autoReviewManualEdits';
const DEFAULT_SHORTCUTS: ShortcutMap = {
  draw: 'F',
  previousFrame: 'A',
  nextFrame: 'D',
  copyPrevious: 'C',
  undo: 'Ctrl+Z',
  zoomIn: '+',
  zoomOut: '-',
  markReviewed: 'Enter',
  deleteBox: 'Delete'
};
const SHORTCUT_ACTIONS: ShortcutAction[] = [
  'draw',
  'previousFrame',
  'nextFrame',
  'copyPrevious',
  'undo',
  'zoomIn',
  'zoomOut',
  'markReviewed',
  'deleteBox'
];
const CORNER_HANDLES: ResizeHandle[] = ['tl', 'tr', 'br', 'bl'];
const EDGE_HANDLES: ResizeHandle[] = ['t', 'r', 'b', 'l'];

const TEXT = {
  en: {
    openFile: 'Open File',
    openFolder: 'Open Folder',
    settings: 'Settings',
    closeSettings: 'Close settings',
    settingsGeneral: 'General',
    settingsAppearance: 'Appearance',
    settingsKeyboardShortcuts: 'Keyboard shortcuts',
    language: 'Language',
    shortcuts: 'Shortcuts',
    resetShortcuts: 'Reset shortcuts',
    autoReviewManualEdits: 'Auto-mark reviewed after manual edits',
    autoReviewManualEditsHelp: 'Drawing, moving, resizing, deleting, copying, and editing boxes will mark the current frame reviewed.',
    darkMode: 'Dark mode',
    darkModeHelp: 'Use a darker interface while keeping media colors unchanged.',
    editShortcut: 'Edit {label} shortcut',
    pressShortcut: 'Press shortcut...',
    shortcutConflict: '{shortcut} is already used by {label}.',
    english: 'English',
    chinese: '中文',
    dataset: 'Dataset',
    canvas: 'Canvas',
    labels: 'Labels',
    mediaCount: '{media} media / {frames} frames',
    framesNeedReview: 'frames need review',
    namePrefix: 'Name prefix',
    previousFrame: 'Previous frame',
    nextFrame: 'Next frame',
    drawBbox: 'Draw bbox',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    fit: 'Fit',
    noMediaLoaded: 'No media loaded',
    emptyHelp: 'Use Open File or Open Folder to load images and videos.',
    reviewState: 'Review state',
    markReviewed: 'Mark reviewed',
    noBoxes: 'No boxes',
    boxCount: '{count} box(es)',
    box: 'Box',
    boxName: 'Box name',
    class: 'Class',
    deleteBox: 'Delete box',
    aiExport: 'AI & export',
    currentModel: 'Current model',
    noModelSelected: 'No model selected',
    useBundledModel: 'Use bundled YOLOv8n',
    chooseLocalModel: 'Choose local model...',
    downloadAdvancedModel: 'Download advanced model',
    selectModel: 'Select model',
    runAiLabels: 'Run AI labels',
    export: 'Export',
    prepareExport: 'Prepare export',
    ready: 'Ready',
    nothingToUndo: 'Nothing to undo',
    undidLastEdit: 'Undid last edit',
    desktopRequired: '{action} requires the Electron desktop app. Run npm run dev or open the packaged app instead of the Vite browser preview.',
    opened: 'Opened {name}',
    addedMedia: 'Added {count} media item(s)',
    noNewMedia: 'No new media selected.',
    noAiModel: 'No AI model selected.',
    noFramesAi: 'No frames in active media for AI labeling.',
    aiLabeling: 'AI labeling {completed}/{total}',
    aiComplete: 'AI labeling complete. Review queue updated.',
    exportPrepared: 'Prepared {count} {format} file(s).',
    exportedObject: 'Prepared {format} export object.',
    copiedBoxes: 'Copied {count} box(es) from previous frame.',
    noPreviousBoxes: 'No previous frame boxes to copy.',
    importingMedia: 'Importing media',
    importing: 'Importing {progress}%',
    importFailed: 'Import failed',
    frames: '{count} frames',
    image: 'image',
    video: 'video',
    selectMedia: 'Select {name}',
    removeMedia: 'Remove {name}',
    shortcutLabels: {
      draw: 'Draw bbox',
      previousFrame: 'Previous frame',
      nextFrame: 'Next frame',
      copyPrevious: 'Copy previous boxes',
      undo: 'Undo',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      markReviewed: 'Mark reviewed',
      deleteBox: 'Delete box'
    }
  },
  zh: {
    openFile: '打开文件',
    openFolder: '打开文件夹',
    settings: '设置',
    closeSettings: '关闭设置',
    settingsGeneral: '常规',
    settingsAppearance: '外观',
    settingsKeyboardShortcuts: '键盘快捷键',
    language: '语言',
    shortcuts: '快捷键',
    resetShortcuts: '重置快捷键',
    autoReviewManualEdits: '手动操作后自动标记为已审核',
    autoReviewManualEditsHelp: '画框、移动、拉伸、删除、复制和编辑框后，当前帧会自动变为已复核。',
    darkMode: '暗色模式',
    darkModeHelp: '切换为深色界面，图片和视频本身不变。',
    editShortcut: '编辑{label}快捷键',
    pressShortcut: '按下快捷键...',
    shortcutConflict: '{shortcut} 已被 {label} 使用。',
    english: 'English',
    chinese: '中文',
    dataset: '数据集',
    canvas: '画布',
    labels: '标签',
    mediaCount: '{media} 个媒体 / {frames} 帧',
    framesNeedReview: '帧需要复核',
    namePrefix: '命名前缀',
    previousFrame: '上一帧',
    nextFrame: '下一帧',
    drawBbox: '画框',
    zoomOut: '缩小',
    zoomIn: '放大',
    fit: '适应',
    noMediaLoaded: '未加载媒体',
    emptyHelp: '使用打开文件或打开文件夹加载图片和视频。',
    reviewState: '复核状态',
    markReviewed: '标记已复核',
    noBoxes: '无框',
    boxCount: '{count} 个框',
    box: '标注框',
    boxName: '框名称',
    class: '类别',
    deleteBox: '删除框',
    aiExport: 'AI 与导出',
    currentModel: '当前模型',
    noModelSelected: '未选择模型',
    useBundledModel: '使用内置 YOLOv8n',
    chooseLocalModel: '选择本机模型...',
    downloadAdvancedModel: '下载高级模型',
    selectModel: '选择模型',
    runAiLabels: '运行 AI 标注',
    export: '导出',
    prepareExport: '准备导出',
    ready: '就绪',
    nothingToUndo: '没有可撤回操作',
    undidLastEdit: '已撤回上一步编辑',
    desktopRequired: '{action} 需要 Electron 桌面应用。请运行 npm run dev 或打开打包后的应用。',
    opened: '已打开 {name}',
    addedMedia: '已添加 {count} 个媒体',
    noNewMedia: '没有选择新媒体。',
    noAiModel: '未选择 AI 模型。',
    noFramesAi: '当前媒体没有可用于 AI 标注的帧。',
    aiLabeling: 'AI 标注 {completed}/{total}',
    aiComplete: 'AI 标注完成，请复核结果。',
    exportPrepared: '已准备 {count} 个 {format} 文件。',
    exportedObject: '已准备 {format} 导出对象。',
    copiedBoxes: '已从上一帧复制 {count} 个框。',
    noPreviousBoxes: '上一帧没有可复制的框。',
    importingMedia: '正在导入媒体',
    importing: '正在导入 {progress}%',
    importFailed: '导入失败',
    frames: '{count} 帧',
    image: '图片',
    video: '视频',
    selectMedia: '选择 {name}',
    removeMedia: '移除 {name}',
    shortcutLabels: {
      draw: '画框',
      previousFrame: '上一帧',
      nextFrame: '下一帧',
      copyPrevious: '复制上一帧框',
      undo: '撤回',
      zoomIn: '放大',
      zoomOut: '缩小',
      markReviewed: '标记已复核',
      deleteBox: '删除框'
    }
  }
} as const;
type TextKey = keyof Omit<typeof TEXT.en, 'shortcutLabels'>;

export default function App() {
  const [project, setProject] = useState<Project>(() => createEmptyRendererProject());
  const [language, setLanguageState] = useState<Language>(() => loadLanguage());
  const [shortcuts, setShortcutsState] = useState<ShortcutMap>(() => loadShortcuts());
  const [theme, setThemeState] = useState<Theme>(() => loadTheme());
  const [autoReviewManualEdits, setAutoReviewManualEditsState] = useState(() => loadAutoReviewManualEdits());
  const [activeMediaId, setActiveMediaId] = useState('');
  const [activeFrameId, setActiveFrameId] = useState('');
  const [selectedAnnotationId, setSelectedAnnotationId] = useState('');
  const [mode, setMode] = useState<ToolMode>('select');
  const [exportFormat, setExportFormat] = useState<LabelFormat>('yolo');
  const [status, setStatus] = useState<string>(() => TEXT[language].ready);
  const [draftBox, setDraftBox] = useState<Bbox | undefined>();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recordingShortcut, setRecordingShortcut] = useState<ShortcutAction | undefined>();
  const [shortcutError, setShortcutError] = useState('');
  const [aiProgress, setAiProgress] = useState<{ running: boolean; completed: number; total: number; error?: string }>({
    running: false,
    completed: 0,
    total: 0
  });
  const activeFrameIdRef = useRef(activeFrameId);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const t = useCallback((key: TextKey, params?: Record<string, string | number>) => translate(language, key, params), [language]);
  const shortcutLabel = useCallback((action: ShortcutAction) => TEXT[language].shortcutLabels[action], [language]);

  const allFrames = useMemo(() => project.media.flatMap((media) => media.frames), [project.media]);
  const activeMedia = project.media.find((media) => media.id === activeMediaId) ?? project.media[0];
  const frames = activeMedia?.frames ?? [];
  const activeFrameIndex = frames.findIndex((frame) => frame.id === activeFrameId);
  const activeFrame = activeFrameIndex >= 0 ? frames[activeFrameIndex] : frames[0];
  const selectedAnnotation = activeFrame?.annotations.find((annotation) => annotation.id === selectedAnnotationId);
  const reviewQueue = allFrames.filter((frame) => frame.reviewState === 'unreviewed_ai' || frame.reviewState === 'modified');

  useEffect(() => {
    activeFrameIdRef.current = activeFrameId;
  }, [activeFrameId]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const container = filmstripRef.current;
    const selectedThumb = container?.querySelector<HTMLElement>('.thumb.selected');
    if (!container || !selectedThumb) return;
    const selectedCenter = selectedThumb.offsetLeft + selectedThumb.offsetWidth / 2;
    const nextScrollLeft = Math.max(0, selectedCenter - container.clientWidth / 2);
    container.scrollLeft = nextScrollLeft;
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ left: nextScrollLeft, behavior: 'smooth' });
    }
  }, [activeFrame?.id, frames.length]);

  function desktopApi(action: string) {
    const api = window.labelingEasier;
    if (!api) {
      setStatus(t('desktopRequired', { action }));
    }
    return api;
  }

  function setLanguage(nextLanguage: Language) {
    setLanguageState(nextLanguage);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  }

  function setShortcuts(nextShortcuts: ShortcutMap) {
    setShortcutsState(nextShortcuts);
    localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(nextShortcuts));
  }

  function setTheme(nextTheme: Theme) {
    setThemeState(nextTheme);
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  function setAutoReviewManualEdits(nextValue: boolean) {
    setAutoReviewManualEditsState(nextValue);
    localStorage.setItem(AUTO_REVIEW_STORAGE_KEY, String(nextValue));
  }

  function setProjectState(updater: (current: Project) => Project) {
    setProject((current) => updater(current));
  }

  function pushUndoSnapshot() {
    setHistory((current) => [
      ...current.slice(-49),
      { project, activeMediaId, activeFrameId, selectedAnnotationId }
    ]);
  }

  function undoLastChange() {
    setHistory((current) => {
      const previous = current.at(-1);
    if (!previous) {
        setStatus(t('nothingToUndo'));
        return current;
      }
      setProject(previous.project);
      setActiveMediaId(previous.activeMediaId);
      setActiveFrameId(previous.activeFrameId);
      setSelectedAnnotationId(previous.selectedAnnotationId);
      setStatus(t('undidLastEdit'));
      return current.slice(0, -1);
    });
  }

  const setFrameByIndex = useCallback(
    (nextIndex: number) => {
      const nextFrame = frames[Math.max(0, Math.min(frames.length - 1, nextIndex))];
      if (nextFrame) {
        setActiveFrameId(nextFrame.id);
        setSelectedAnnotationId(nextFrame.annotations[0]?.id ?? '');
      }
    },
    [frames]
  );

  useEffect(() => {
    const api = window.labelingEasier;
    if (!api?.bundledModelPath) return;
    let cancelled = false;
    void api.bundledModelPath().then((modelPath) => {
      if (cancelled) return;
      setProjectState((current) =>
        current.settings.modelPath ? current : { ...current, settings: { ...current.settings, modelPath } }
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const api = window.labelingEasier;
    if (!api?.autoSaveProject) return;
    void api.autoSaveProject(project);
  }, [project]);

  useEffect(() => {
    return window.labelingEasier?.onMediaImportEvent?.((event) => {
      handleMediaImportEvent(event);
    });
  }, []);

  useEffect(() => {
    return window.labelingEasier?.onAiEvent?.((event) => {
      handleAiEvent(event);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (recordingShortcut) {
        event.preventDefault();
        const shortcut = shortcutFromEvent(event);
        if (!shortcut) return;
        const conflictingAction = SHORTCUT_ACTIONS.find(
          (action) => action !== recordingShortcut && shortcuts[action] === shortcut
        );
        if (conflictingAction) {
          setShortcutError(t('shortcutConflict', { shortcut, label: shortcutLabel(conflictingAction) }));
          return;
        }
        setShortcuts({ ...shortcuts, [recordingShortcut]: shortcut });
        setShortcutError('');
        setRecordingShortcut(undefined);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA') return;
      if (selectedAnnotation && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        pushUndoSnapshot();
        updateSelectedAnnotation({ bbox: clampBbox(moveBbox(selectedAnnotation.bbox, dx, dy), activeMedia?.width ?? 0, activeMedia?.height ?? 0) });
        return;
      }
      const action = actionFromEvent(event, shortcuts);
      if (!action) return;
      event.preventDefault();
      if (action === 'undo') {
        undoLastChange();
        return;
      }
      if (action === 'zoomIn') {
        setZoomValue(zoom + 0.1);
        return;
      }
      if (action === 'zoomOut') {
        setZoomValue(zoom - 0.1);
        return;
      }
      if (action === 'draw') {
        setMode('draw');
        return;
      }
      if (action === 'markReviewed') {
        markActiveReviewed();
        return;
      }
      if (action === 'deleteBox') {
        deleteSelectedAnnotation();
        return;
      }
      if (!frames.length) return;
      if (action === 'copyPrevious') {
        event.preventDefault();
        copyPreviousFrameBoxes();
        return;
      }
      if (action === 'nextFrame') setFrameByIndex(Math.max(0, activeFrameIndex) + 1);
      if (action === 'previousFrame') setFrameByIndex(Math.max(0, activeFrameIndex) - 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeFrameIndex, activeMedia, activeFrame, frames, selectedAnnotation, setFrameByIndex, zoom, history, project, shortcuts, recordingShortcut, autoReviewManualEdits, t, shortcutLabel]);

  function handleMediaImportEvent(event: MediaImportEvent) {
    if (event.type === 'progress') {
      setProjectState((current) => ({
        ...current,
        media: current.media.map((media) =>
          media.id === event.mediaId ? { ...media, importStatus: 'importing', importProgress: event.progress } : media
        )
      }));
    }
    if (event.type === 'partial') {
      setProjectState((current) => ({
        ...current,
        media: replaceImportedMedia(current.media, event),
        updatedAt: nowIso()
      }));
      setActiveMediaId((current) => current || event.media.id);
      setActiveFrameId((current) => current || (event.media.frames[0]?.id ?? ''));
    }
    if (event.type === 'error') {
      setProjectState((current) => ({
        ...current,
        media: current.media.map((media) =>
          media.id === event.mediaId ? { ...media, importStatus: 'error', importError: event.message } : media
        )
      }));
      setStatus(event.message);
    }
    if (event.type === 'done') {
      setProjectState((current) => ({
        ...current,
        media: replaceImportedMedia(current.media, event),
        updatedAt: nowIso()
      }));
      setActiveMediaId((current) => (current && current !== event.mediaId ? current : event.media.id));
      setActiveFrameId((current) => current || (event.media.frames[0]?.id ?? ''));
      setStatus(t('opened', { name: event.media.name }));
    }
  }

  function handleAiEvent(event: AiWorkerEvent) {
    if (event.type === 'ready') {
      setStatus(`AI worker ready on ${event.device}`);
      return;
    }
    if (event.type === 'progress') {
      setAiProgress({ running: true, completed: event.completed, total: event.total });
      setStatus(t('aiLabeling', { completed: event.completed, total: event.total }));
      return;
    }
    if (event.type === 'result') {
      const firstAnnotationId = event.detections[0] ? aiAnnotationId(event.frameId, 0) : '';
      setProjectState((current) => applyAiDetections(current, event.frameId, event.detections));
      if (firstAnnotationId && event.frameId === activeFrameIdRef.current) {
        setSelectedAnnotationId(firstAnnotationId);
      }
      return;
    }
    if (event.type === 'done') {
      setAiProgress((current) => ({ ...current, running: false, completed: current.total }));
      setStatus(t('aiComplete'));
      return;
    }
    if (event.type === 'error') {
      setAiProgress((current) => ({ ...current, running: false, error: event.message }));
      setStatus(event.message);
    }
  }

  function setActiveFromProject(nextProject: Project) {
    const hydratedProject = nextProject.settings.modelPath || !project.settings.modelPath
      ? nextProject
      : { ...nextProject, settings: { ...nextProject.settings, modelPath: project.settings.modelPath } };
    const firstMedia = hydratedProject.media[0];
    const firstFrame = firstMedia?.frames[0];
    setProject(hydratedProject);
    setActiveMediaId(firstMedia?.id ?? '');
    setActiveFrameId(firstFrame?.id ?? '');
    setSelectedAnnotationId(firstFrame?.annotations[0]?.id ?? '');
    setDraftBox(undefined);
    setMode('select');
    resetView();
  }

  function appendMedia(media: MediaItem[]) {
    if (!media.length) return;
    let firstNewMedia: MediaItem | undefined;
    setProjectState((current) => {
      const existingPaths = new Set(current.media.map((item) => normalizePath(item.path)));
      const fresh = media.filter((item) => !existingPaths.has(normalizePath(item.path)));
      firstNewMedia = fresh[0];
      if (!fresh.length) {
        const duplicate = media.find((item) => existingPaths.has(normalizePath(item.path)));
        if (duplicate) {
          const existing = current.media.find((item) => normalizePath(item.path) === normalizePath(duplicate.path));
          if (existing) {
            setActiveMediaId(existing.id);
            setActiveFrameId(existing.frames[0]?.id ?? '');
            setStatus(`${existing.name} already exists`);
          }
        }
        return current;
      }
      return { ...current, media: [...current.media, ...fresh], updatedAt: nowIso() };
    });
    if (firstNewMedia) {
      setActiveMediaId(firstNewMedia.id);
      setActiveFrameId(firstNewMedia.frames[0]?.id ?? '');
      setSelectedAnnotationId(firstNewMedia.frames[0]?.annotations[0]?.id ?? '');
      setStatus(t('addedMedia', { count: media.length }));
      resetView();
    }
  }

  function updateFrame(frameId: string, updater: (frame: FrameRecord) => FrameRecord) {
    setProjectState((current) => ({
      ...current,
      media: current.media.map((media) => ({
        ...media,
        frames: media.frames.map((frame) => (frame.id === frameId ? updater(frame) : frame))
      })),
      updatedAt: nowIso()
    }));
  }

  function updateActiveMedia(patch: Partial<MediaItem>) {
    if (!activeMedia) return;
    setProjectState((current) => ({
      ...current,
      media: current.media.map((media) => (media.id === activeMedia.id ? { ...media, ...patch } : media)),
      updatedAt: nowIso()
    }));
  }

  function manualAnnotationReviewState(): Annotation['reviewState'] {
    return autoReviewManualEdits ? 'reviewed' : 'modified';
  }

  function frameAfterManualEdit(frame: FrameRecord, annotations: Annotation[]): FrameRecord {
    const editedFrame = { ...frame, annotations };
    if (autoReviewManualEdits) {
      return markFrameReviewed(editedFrame);
    }
    return { ...editedFrame, reviewState: 'modified' };
  }

  function addAnnotation(bbox: Bbox) {
    if (!activeFrame || !activeMedia || !project.classes[0]) return;
    pushUndoSnapshot();
    const annotation: Annotation = {
      id: `ann-${Date.now()}`,
      name: nextAnnotationName(activeMedia, activeFrame),
      frameId: activeFrame.id,
      classId: project.classes[0].id,
      bbox: clampBbox(bbox, activeMedia.width, activeMedia.height),
      source: 'manual',
      reviewState: manualAnnotationReviewState(),
      updatedAt: nowIso()
    };
    updateFrame(activeFrame.id, (frame) => frameAfterManualEdit(frame, [...frame.annotations, annotation]));
    setSelectedAnnotationId(annotation.id);
    setMode('select');
  }

  function deleteSelectedAnnotation() {
    if (!activeFrame || !selectedAnnotationId) return;
    pushUndoSnapshot();
    updateFrame(activeFrame.id, (frame) =>
      frameAfterManualEdit(frame, frame.annotations.filter((annotation) => annotation.id !== selectedAnnotationId))
    );
    setSelectedAnnotationId('');
  }

  function markActiveReviewed() {
    if (!activeFrame) return;
    updateFrame(activeFrame.id, (frame) => markFrameReviewed(frame));
    setStatus(t('markReviewed'));
  }

  function updateSelectedAnnotation(patch: Partial<Pick<Annotation, 'name' | 'classId' | 'bbox'>>) {
    if (!activeFrame || !selectedAnnotationId) return;
    updateFrame(activeFrame.id, (frame) =>
      frameAfterManualEdit(
        frame,
        frame.annotations.map((annotation) =>
          annotation.id === selectedAnnotationId
            ? { ...annotation, ...patch, reviewState: manualAnnotationReviewState(), updatedAt: nowIso() }
            : annotation
        )
      )
    );
  }

  function updateAnnotation(annotationId: string, patch: Partial<Pick<Annotation, 'bbox'>>) {
    if (!activeFrame) return;
    updateFrame(activeFrame.id, (frame) =>
      frameAfterManualEdit(
        frame,
        frame.annotations.map((annotation) =>
          annotation.id === annotationId
            ? { ...annotation, ...patch, reviewState: manualAnnotationReviewState(), updatedAt: nowIso() }
            : annotation
        )
      )
    );
  }

  function updateSelectedBbox(field: keyof Bbox, value: number) {
    if (!selectedAnnotation || !activeMedia) return;
    pushUndoSnapshot();
    updateSelectedAnnotation({ bbox: clampBbox({ ...selectedAnnotation.bbox, [field]: value }, activeMedia.width, activeMedia.height) });
  }

  async function openFolder() {
    const api = desktopApi(t('openFolder'));
    if (!api?.openFolder) return;
    const opened = await api.openFolder(project.settings.ffmpegPath, 'ffprobe');
    if (opened) {
      setActiveFromProject(opened);
      setStatus(t('opened', { name: opened.name }));
    } else {
      setStatus(t('noNewMedia'));
    }
  }

  async function openFile() {
    const api = desktopApi(t('openFile'));
    if (!api?.openFile) return;
    const media = await api.openFile(project.settings.ffmpegPath, 'ffprobe');
    if (!media.length) {
      setStatus(t('noNewMedia'));
      return;
    }
    appendMedia(media);
  }

  async function chooseBundledModel() {
    const api = desktopApi('Use bundled model');
    if (!api?.bundledModelPath) return;
    const modelPath = await api.bundledModelPath();
    setProjectState((current) => ({ ...current, settings: { ...current.settings, modelPath }, updatedAt: nowIso() }));
  }

  async function chooseLocalModel() {
    const api = desktopApi('Choose local model');
    if (!api?.chooseModelFile) return;
    const modelPath = await api.chooseModelFile();
    if (modelPath) {
      setProjectState((current) => ({ ...current, settings: { ...current.settings, modelPath }, updatedAt: nowIso() }));
    }
  }

  async function downloadAdvancedModel(model: string) {
    const api = desktopApi('Download model');
    if (!api?.downloadModel || (model !== 'yolov8s' && model !== 'yolov8m')) return;
    const modelPath = await api.downloadModel(model);
    setProjectState((current) => ({ ...current, settings: { ...current.settings, modelPath }, updatedAt: nowIso() }));
  }

  async function runAi() {
    const api = desktopApi('Run AI labels');
    if (!api) return;
    if (!project.settings.modelPath) {
      setStatus(t('noAiModel'));
      setAiProgress({ running: false, completed: 0, total: 0, error: t('noAiModel') });
      return;
    }
    if (!activeMedia || !frames.length) {
      setStatus(t('noFramesAi'));
      return;
    }
    pushUndoSnapshot();
    setAiProgress({ running: true, completed: 0, total: frames.length });
    setStatus(t('aiLabeling', { completed: 0, total: frames.length }));
    const result = await api.runAi(
      project.settings,
      frames.map((frame) => ({ frameId: frame.id, imagePath: frame.imagePath, mediaId: activeMedia.id, index: frame.index }))
    );
    if (!result?.started) {
      const reason = result?.reason ?? 'AI worker unavailable in browser preview';
      setAiProgress({ running: false, completed: 0, total: frames.length, error: reason });
      setStatus(reason);
    }
  }

  function copyPreviousFrameBoxes() {
    if (!activeFrame || !activeMedia || activeFrameIndex <= 0) {
      setStatus(t('noPreviousBoxes'));
      return;
    }
    const previousFrame = frames[activeFrameIndex - 1];
    if (!previousFrame?.annotations.length) {
      setStatus(t('noPreviousBoxes'));
      return;
    }
    pushUndoSnapshot();
    const timestamp = nowIso();
    const copies = previousFrame.annotations.map((annotation, index) => ({
      ...annotation,
      id: `ann-copy-${Date.now()}-${index}`,
      name: annotationNameAt(activeMedia, activeFrame, activeFrame.annotations.length + index + 1),
      frameId: activeFrame.id,
      bbox: { ...annotation.bbox },
      source: 'manual' as const,
      reviewState: manualAnnotationReviewState(),
      updatedAt: timestamp
    }));
    updateFrame(activeFrame.id, (frame) => frameAfterManualEdit(frame, [...frame.annotations, ...copies]));
    setSelectedAnnotationId(copies[0]?.id ?? '');
    setStatus(t('copiedBoxes', { count: copies.length }));
  }

  function runExportPreview() {
    const countByFormat: Record<LabelFormat, number> = {
      yolo: exportYolo(project).length,
      coco: exportCoco(project).annotations.length,
      voc: exportVoc(project).length,
      labelme: exportLabelMe(project).length
    };
    setStatus(t('exportPrepared', { count: countByFormat[exportFormat], format: EXPORT_OPTIONS.find((option) => option.value === exportFormat)?.label ?? exportFormat }));
  }

  function removeMedia(mediaId: string) {
    setProjectState((current) => {
      const nextMedia = current.media.filter((media) => media.id !== mediaId);
      return { ...current, media: nextMedia, updatedAt: nowIso() };
    });
    if (activeMediaId === mediaId) {
      const fallback = project.media.find((media) => media.id !== mediaId);
      setActiveMediaId(fallback?.id ?? '');
      setActiveFrameId(fallback?.frames[0]?.id ?? '');
      setSelectedAnnotationId(fallback?.frames[0]?.annotations[0]?.id ?? '');
    }
  }

  function selectMedia(media: MediaItem) {
    setActiveMediaId(media.id);
    setActiveFrameId(media.frames[0]?.id ?? '');
    setSelectedAnnotationId(media.frames[0]?.annotations[0]?.id ?? '');
    resetView();
  }

  function setZoomValue(value: number) {
    setZoom(Math.round(clamp(value, ZOOM_MIN, ZOOM_MAX) * 100) / 100);
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function fitView() {
    resetView();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>Labeling Easier</h1>
        <div className="topbar-actions">
          <button onClick={openFile}>
            <File size={16} /> {t('openFile')}
          </button>
          <button onClick={openFolder}>
            <FolderOpen size={16} /> {t('openFolder')}
          </button>
        </div>
        <span className="topbar-status">{status}</span>
      </header>

      <section className="workspace">
        <aside className="sidebar left-panel" aria-label={t('dataset')}>
          <PanelHeader title={t('dataset')} detail={t('mediaCount', { media: project.media.length, frames: allFrames.length })} />
          <div className="review-summary">
            <strong>{reviewQueue.length}</strong>
            <span>{t('framesNeedReview')}</span>
          </div>
          <div className="media-list">
            {project.media.map((media) => (
              <div key={media.id} className={media.id === activeMedia?.id ? 'media-row active' : 'media-row'}>
                <button aria-label={t('selectMedia', { name: media.name })} onClick={() => selectMedia(media)}>
                  <strong>{media.name}</strong>
                  <small>
                    <span>{media.type === 'video' ? t('video') : t('image')}</span>
                    <span>{mediaStatusText(media, t)}</span>
                  </small>
                </button>
                <button className="icon-danger" aria-label={t('removeMedia', { name: media.name })} onClick={() => removeMedia(media.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          {activeMedia?.type === 'video' ? (
            <label>
              {t('namePrefix')}
              <input
                value={activeMedia.annotationNamePrefix ?? basenameWithoutExt(activeMedia.name)}
                onChange={(event) => updateActiveMedia({ annotationNamePrefix: event.target.value })}
              />
            </label>
          ) : null}
          <div className="sidebar-footer">
            <button className="settings-button" aria-label={t('settings')} onClick={() => setSettingsOpen(true)}>
              <SettingsIcon size={16} />
            </button>
          </div>
        </aside>

        <section className="canvas-column">
          <div className="canvas-toolbar">
            <div>
              <h2>{t('canvas')}</h2>
              <span data-testid="active-frame">{activeFrame ? `Frame ${Math.max(0, activeFrameIndex) + 1} / ${frames.length}` : t('noMediaLoaded')}</span>
            </div>
            <div className="tool-group">
              <button onClick={() => setFrameByIndex(activeFrameIndex - 1)} aria-label={t('previousFrame')} disabled={!activeFrame}>
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setMode(mode === 'draw' ? 'select' : 'draw')} className={mode === 'draw' ? 'active-tool' : ''} disabled={!activeFrame}>
                <Square size={16} /> {t('drawBbox')} ({shortcuts.draw})
              </button>
              <button onClick={() => setFrameByIndex(activeFrameIndex + 1)} aria-label={t('nextFrame')} disabled={!activeFrame}>
                <ChevronRight size={16} />
              </button>
              <button onClick={() => setZoomValue(zoom - 0.1)} aria-label={t('zoomOut')} disabled={!activeFrame}>
                <Minus size={16} />
              </button>
              <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoomValue(zoom + 0.1)} aria-label={t('zoomIn')} disabled={!activeFrame}>
                <Plus size={16} />
              </button>
              <button onClick={fitView} disabled={!activeFrame}>{t('fit')}</button>
              <button onClick={resetView} disabled={!activeFrame}>100%</button>
            </div>
          </div>
          <AnnotationCanvas
            frame={activeFrame}
            media={activeMedia}
            classes={project.classes}
            selectedAnnotationId={selectedAnnotationId}
            mode={mode}
            draftBox={draftBox}
            zoom={zoom}
            pan={pan}
            onZoom={setZoomValue}
            onPan={setPan}
            onDraft={setDraftBox}
            onCreate={addAnnotation}
            onSelect={setSelectedAnnotationId}
            onUpdate={updateAnnotation}
            onEditStart={pushUndoSnapshot}
            t={t}
          />
          <div className="filmstrip" aria-label="Video frame strip" ref={filmstripRef}>
            {frames.map((frame) => (
              <button
                key={frame.id}
                data-frame-id={frame.id}
                className={frame.id === activeFrame?.id ? 'thumb frame-row selected' : 'thumb frame-row'}
                onClick={() => setActiveFrameId(frame.id)}
              >
                <img src={mediaUrl(frame.imagePath)} alt="" />
                <span>{frame.index + 1}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="sidebar right-panel" aria-label={t('labels')}>
          <PanelHeader title={t('labels')} detail={activeFrame?.annotations.length ? t('boxCount', { count: activeFrame.annotations.length }) : t('noBoxes')} />
          {activeFrame ? (
            <div className="state-card">
              <span>{t('reviewState')}</span>
              <strong data-testid="review-state">{activeFrame.reviewState}</strong>
              <button onClick={markActiveReviewed}>
                <CheckCircle2 size={16} /> {t('markReviewed')}
              </button>
            </div>
          ) : null}

          <div className="annotation-list">
            {activeFrame?.annotations.map((annotation) => {
              const klass = project.classes.find((item) => item.id === annotation.classId);
              return (
                <button
                  key={annotation.id}
                  className={annotation.id === selectedAnnotationId ? 'annotation-row selected' : 'annotation-row'}
                  onClick={() => setSelectedAnnotationId(annotation.id)}
                >
                  <span style={{ backgroundColor: klass?.color }} />
                  <div>
                    <strong>{annotation.name}</strong>
                    <small>{klass?.name ?? 'unknown'} · {annotation.source}{annotation.confidence ? ` · ${(annotation.confidence * 100).toFixed(0)}%` : ''}</small>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedAnnotation ? (
            <div className="inspector">
              <h3>{t('box')}</h3>
              <label>
                {t('boxName')}
                <input value={selectedAnnotation.name} onChange={(event) => updateSelectedAnnotation({ name: event.target.value })} />
              </label>
              <label>
                {t('class')}
                <select value={selectedAnnotation.classId} onChange={(event) => updateSelectedAnnotation({ classId: event.target.value })}>
                  {project.classes.map((klass) => (
                    <option key={klass.id} value={klass.id}>{klass.name}</option>
                  ))}
                </select>
              </label>
              {(['x', 'y', 'width', 'height'] as Array<keyof Bbox>).map((field) => (
                <label key={field}>
                  {field}
                  <input type="number" value={Math.round(selectedAnnotation.bbox[field])} onChange={(event) => updateSelectedBbox(field, Number(event.target.value))} />
                </label>
              ))}
              <button className="danger" onClick={deleteSelectedAnnotation}>
                <Trash2 size={16} /> {t('deleteBox')}
              </button>
            </div>
          ) : null}

          <div className="settings-panel">
            <h3>{t('aiExport')}</h3>
            <div className="model-current">
              <span>{t('currentModel')}</span>
              <strong>{modelFileName(project.settings.modelPath, t)}</strong>
            </div>
            <button onClick={chooseBundledModel}>{t('useBundledModel')}</button>
            <button onClick={chooseLocalModel}>{t('chooseLocalModel')}</button>
            <label>
              {t('downloadAdvancedModel')}
              <select defaultValue="" onChange={(event) => void downloadAdvancedModel(event.target.value)}>
                <option value="" disabled>{t('selectModel')}</option>
                <option value="yolov8s">YOLOv8s</option>
                <option value="yolov8m">YOLOv8m</option>
              </select>
            </label>
            {aiProgress.running || aiProgress.total ? (
              <div className="ai-progress" aria-label="AI labeling progress">
                <progress value={aiProgress.completed} max={Math.max(1, aiProgress.total)} />
                <span>{t('aiLabeling', { completed: aiProgress.completed, total: aiProgress.total })}</span>
                {aiProgress.error ? <small>{aiProgress.error}</small> : null}
              </div>
            ) : aiProgress.error ? (
              <div className="ai-progress error" aria-label="AI labeling error">{aiProgress.error}</div>
            ) : null}
            <button onClick={runAi} disabled={aiProgress.running || !activeMedia}>
              <Bot size={16} /> {t('runAiLabels')}
            </button>
            <label>
              {t('export')}
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as LabelFormat)}>
                {EXPORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button onClick={runExportPreview}>
              <Download size={16} /> {t('prepareExport')}
            </button>
          </div>
        </aside>
      </section>
      {settingsOpen ? (
        <SettingsDialog
          language={language}
          theme={theme}
          autoReviewManualEdits={autoReviewManualEdits}
          shortcuts={shortcuts}
          recordingShortcut={recordingShortcut}
          shortcutError={shortcutError}
          t={t}
          shortcutLabel={shortcutLabel}
          onLanguageChange={setLanguage}
          onThemeChange={setTheme}
          onAutoReviewManualEditsChange={setAutoReviewManualEdits}
          onRecord={(action) => {
            setShortcutError('');
            setRecordingShortcut(action);
          }}
          onReset={() => {
            setShortcuts(DEFAULT_SHORTCUTS);
            setShortcutError('');
            setRecordingShortcut(undefined);
          }}
          onClose={() => {
            setSettingsOpen(false);
            setRecordingShortcut(undefined);
            setShortcutError('');
          }}
        />
      ) : null}
    </main>
  );
}

function PanelHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      <span>{detail}</span>
    </div>
  );
}

function SettingsDialog({
  language,
  theme,
  autoReviewManualEdits,
  shortcuts,
  recordingShortcut,
  shortcutError,
  t,
  shortcutLabel,
  onLanguageChange,
  onThemeChange,
  onAutoReviewManualEditsChange,
  onRecord,
  onReset,
  onClose
}: {
  language: Language;
  theme: Theme;
  autoReviewManualEdits: boolean;
  shortcuts: ShortcutMap;
  recordingShortcut?: ShortcutAction;
  shortcutError: string;
  t: (key: TextKey, params?: Record<string, string | number>) => string;
  shortcutLabel: (action: ShortcutAction) => string;
  onLanguageChange: (language: Language) => void;
  onThemeChange: (theme: Theme) => void;
  onAutoReviewManualEditsChange: (enabled: boolean) => void;
  onRecord: (action: ShortcutAction) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'general', label: t('settingsGeneral') },
    { id: 'appearance', label: t('settingsAppearance') },
    { id: 'shortcuts', label: t('settingsKeyboardShortcuts') }
  ];

  return (
    <div className="settings-backdrop">
      <section className="settings-dialog" role="dialog" aria-label={t('settings')}>
        <header className="settings-dialog-header">
          <h2>{t('settings')}</h2>
          <button className="icon-button" aria-label={t('closeSettings')} onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="settings-layout">
          <nav className="settings-tabs" aria-label={t('settings')}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={activeTab === tab.id ? 'settings-tab active' : 'settings-tab'}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {activeTab === 'general' ? (
              <div className="settings-section">
                <h3>{t('settingsGeneral')}</h3>
                <label>
                  {t('language')}
                  <div className="segmented-control">
                    <button className={language === 'en' ? 'active-tool' : ''} onClick={() => onLanguageChange('en')}>
                      {t('english')}
                    </button>
                    <button className={language === 'zh' ? 'active-tool' : ''} onClick={() => onLanguageChange('zh')}>
                      {t('chinese')}
                    </button>
                  </div>
                </label>
                <SettingSwitch
                  label={t('autoReviewManualEdits')}
                  description={t('autoReviewManualEditsHelp')}
                  checked={autoReviewManualEdits}
                  onChange={onAutoReviewManualEditsChange}
                />
              </div>
            ) : null}
            {activeTab === 'appearance' ? (
              <div className="settings-section">
                <h3>{t('settingsAppearance')}</h3>
                <SettingSwitch
                  label={t('darkMode')}
                  description={t('darkModeHelp')}
                  checked={theme === 'dark'}
                  onChange={(checked) => onThemeChange(checked ? 'dark' : 'light')}
                />
              </div>
            ) : null}
            {activeTab === 'shortcuts' ? (
              <div className="settings-section">
                <div className="settings-section-heading">
                  <h3>
                    <Keyboard size={15} /> {t('settingsKeyboardShortcuts')}
                  </h3>
                  <button onClick={onReset}>
                    <RotateCcw size={14} /> {t('resetShortcuts')}
                  </button>
                </div>
                <div className="shortcut-list">
                  {SHORTCUT_ACTIONS.map((action) => {
                    const label = shortcutLabel(action);
                    const recording = recordingShortcut === action;
                    return (
                      <div key={action} className="shortcut-row">
                        <div>
                          <strong>{label}</strong>
                          <small>{DEFAULT_SHORTCUTS[action]}</small>
                        </div>
                        <button aria-label={t('editShortcut', { label })} onClick={() => onRecord(action)}>
                          {recording ? t('pressShortcut') : shortcuts[action]}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {shortcutError ? <p className="settings-error">{shortcutError}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function SettingSwitch({
  label,
  description,
  checked,
  onChange
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="setting-switch-row">
      <div>
        <strong>{label}</strong>
        <small>{description}</small>
      </div>
      <button
        className={checked ? 'switch-control checked' : 'switch-control'}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

function AnnotationCanvas({
  frame,
  media,
  classes,
  selectedAnnotationId,
  mode,
  draftBox,
  zoom,
  pan,
  onZoom,
  onPan,
  onDraft,
  onCreate,
  onSelect,
  onUpdate,
  onEditStart,
  t
}: {
  frame?: FrameRecord;
  media?: MediaItem;
  classes: Project['classes'];
  selectedAnnotationId: string;
  mode: ToolMode;
  draftBox?: Bbox;
  zoom: number;
  pan: Point;
  onZoom: (zoom: number) => void;
  onPan: (pan: Point) => void;
  onDraft: (bbox: Bbox | undefined) => void;
  onCreate: (bbox: Bbox) => void;
  onSelect: (id: string) => void;
  onUpdate: (annotationId: string, patch: Partial<Pick<Annotation, 'bbox'>>) => void;
  onEditStart: () => void;
  t: (key: TextKey, params?: Record<string, string | number>) => string;
}) {
  const [drag, setDrag] = useState<CanvasDrag | undefined>();
  const mediaWidth = media?.width || 1280;
  const mediaHeight = media?.height || 720;

  function pointFromEvent(event: PointerEvent<SVGSVGElement>): Point {
    const svg = (event.currentTarget as SVGElement).ownerSVGElement ?? event.currentTarget;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return { x: Math.round(event.clientX), y: Math.round(event.clientY) };
    }
    return {
      x: Math.round(((event.clientX - rect.left) / rect.width) * mediaWidth),
      y: Math.round(((event.clientY - rect.top) / rect.height) * mediaHeight)
    };
  }

  function startDraw(event: PointerEvent<SVGSVGElement>) {
    if (!frame) return;
    if (mode !== 'draw' || event.button === 1) {
      setDrag({
        type: 'pan',
        startClient: { x: event.clientX, y: event.clientY },
        initialPan: pan
      });
      return;
    }
    const point = pointFromEvent(event);
    setDrag({ type: 'draw', origin: point });
    onDraft({ x: point.x, y: point.y, width: 1, height: 1 });
  }

  function movePointer(event: PointerEvent<SVGSVGElement>) {
    const point = pointFromEvent(event);
    if (drag?.type === 'draw') {
      onDraft(normalizeBbox(drag.origin, point));
    }
    if (drag?.type === 'resize') {
      onUpdate(drag.annotationId, { bbox: clampBbox(resizeBbox(drag.initial, drag.handle, point), mediaWidth, mediaHeight) });
    }
    if (drag?.type === 'move') {
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;
      onUpdate(drag.annotationId, { bbox: clampBbox(moveBbox(drag.initial, dx, dy), mediaWidth, mediaHeight) });
    }
    if (drag?.type === 'pan') {
      onPan({
        x: drag.initialPan.x + event.clientX - drag.startClient.x,
        y: drag.initialPan.y + event.clientY - drag.startClient.y
      });
    }
  }

  function endPointer() {
    if (drag?.type === 'draw' && draftBox && draftBox.width > 4 && draftBox.height > 4) {
      onCreate(clampBbox(draftBox, mediaWidth, mediaHeight));
    }
    setDrag(undefined);
    onDraft(undefined);
  }

  function wheel(event: WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    onZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1));
  }

  if (!frame || !media) {
    return (
      <div className="canvas-stage">
        <div className="empty-canvas">
          <strong>{media?.importStatus === 'importing' ? t('importingMedia') : t('noMediaLoaded')}</strong>
          <span>{media?.importStatus === 'importing' ? mediaStatusText(media, t) : t('emptyHelp')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="canvas-stage" onWheel={wheel}>
      <div
        className="image-surface"
        data-testid="image-surface"
        style={{
          aspectRatio: `${mediaWidth} / ${mediaHeight}`,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
        }}
      >
        <img className="media-frame" src={mediaUrl(frame.imagePath)} alt={basename(frame.imagePath)} />
        <svg
          viewBox={`0 0 ${mediaWidth} ${mediaHeight}`}
          className="annotation-overlay"
          data-testid="annotation-overlay"
          onPointerDown={startDraw}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerLeave={endPointer}
        >
          {frame.annotations.map((annotation) => {
            const klass = classes.find((item) => item.id === annotation.classId);
            const selected = annotation.id === selectedAnnotationId;
            const startMove = (event: PointerEvent<SVGRectElement>) => {
              event.stopPropagation();
              const point = pointFromEvent(event as unknown as PointerEvent<SVGSVGElement>);
              onSelect(annotation.id);
              onEditStart();
              setDrag({ type: 'move', annotationId: annotation.id, start: point, initial: annotation.bbox });
            };
            const startResize = (handle: ResizeHandle, event: PointerEvent<SVGElement>) => {
              event.stopPropagation();
              onSelect(annotation.id);
              onEditStart();
              setDrag({ type: 'resize', annotationId: annotation.id, handle, initial: annotation.bbox });
            };
            const hitSize = 30 / zoom;
            return (
              <g key={annotation.id}>
                <rect
                  data-testid={`bbox-hit-${annotation.id}`}
                  x={annotation.bbox.x}
                  y={annotation.bbox.y}
                  width={annotation.bbox.width}
                  height={annotation.bbox.height}
                  className="bbox-hit-area"
                  onPointerDown={startMove}
                />
                <rect
                  data-testid={`bbox-${annotation.id}`}
                  x={annotation.bbox.x}
                  y={annotation.bbox.y}
                  width={annotation.bbox.width}
                  height={annotation.bbox.height}
                  className={selected ? 'bbox selected' : 'bbox'}
                  style={{ stroke: klass?.color ?? '#c96442' }}
                  onPointerDown={startMove}
                />
                <text x={annotation.bbox.x} y={Math.max(14, annotation.bbox.y - 8)}>{annotation.name}</text>
                {selected ? (
                  <>
                    {EDGE_HANDLES.map((handle) => {
                      const rect = edgeHitRect(annotation.bbox, handle, hitSize);
                      return (
                        <rect
                          key={handle}
                          data-testid={`resize-hit-${handle}-${annotation.id}`}
                          className={`bbox-handle-hit bbox-edge-hit handle-${handle}`}
                          x={rect.x}
                          y={rect.y}
                          width={rect.width}
                          height={rect.height}
                          onPointerDown={(event) => startResize(handle, event)}
                        />
                      );
                    })}
                    {CORNER_HANDLES.map((handle) => {
                      const point = handlePoint(annotation.bbox, handle);
                      return (
                        <g key={handle}>
                          <circle
                            data-testid={`resize-hit-${handle}-${annotation.id}`}
                            className={`bbox-handle-hit handle-${handle}`}
                            cx={point.x}
                            cy={point.y}
                            r={hitSize}
                            onPointerDown={(event) => startResize(handle, event)}
                          />
                          <circle
                            data-testid={`resize-${handle}-${annotation.id}`}
                            className={`bbox-handle handle-${handle}`}
                            cx={point.x}
                            cy={point.y}
                            r={5 / zoom}
                            onPointerDown={(event) => startResize(handle, event)}
                          />
                        </g>
                      );
                    })}
                  </>
                ) : null}
              </g>
            );
          })}
          {draftBox ? <rect className="bbox draft" x={draftBox.x} y={draftBox.y} width={draftBox.width} height={draftBox.height} /> : null}
        </svg>
      </div>
    </div>
  );
}

function createEmptyRendererProject(name = 'Untitled Dataset'): Project {
  const timestamp = nowIso();
  return {
    id: stableId('project', [name, timestamp]),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    classes: DEFAULT_CLASSES,
    media: [],
    settings: {
      pythonPath: 'python',
      modelPath: '',
      ffmpegPath: 'ffmpeg',
      confidenceThreshold: 0.25
    },
    exportHistory: []
  };
}

function loadLanguage(): Language {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === 'en' || stored === 'zh') return stored;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function loadShortcuts(): ShortcutMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHORTCUT_STORAGE_KEY) ?? '{}') as Partial<ShortcutMap>;
    return { ...DEFAULT_SHORTCUTS, ...validShortcutEntries(parsed) };
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

function loadTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
}

function loadAutoReviewManualEdits(): boolean {
  return localStorage.getItem(AUTO_REVIEW_STORAGE_KEY) === 'true';
}

function validShortcutEntries(shortcuts: Partial<ShortcutMap>): Partial<ShortcutMap> {
  return Object.fromEntries(
    SHORTCUT_ACTIONS.flatMap((action) => {
      const shortcut = shortcuts[action];
      return typeof shortcut === 'string' && shortcut ? [[action, shortcut]] : [];
    })
  ) as Partial<ShortcutMap>;
}

function translate(language: Language, key: TextKey, params: Record<string, string | number> = {}): string {
  let value = TEXT[language][key] as string;
  for (const [name, replacement] of Object.entries(params)) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

function actionFromEvent(event: KeyboardEvent, shortcuts: ShortcutMap): ShortcutAction | undefined {
  const shortcut = shortcutFromEvent(event);
  return SHORTCUT_ACTIONS.find((action) => shortcuts[action] === shortcut);
}

function shortcutFromEvent(event: KeyboardEvent): string {
  const normalizedKey = normalizeShortcutKey(event.key);
  if (!normalizedKey) return '';
  const modifiers = [
    event.ctrlKey ? 'Ctrl' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey && normalizedKey.length > 1 ? 'Shift' : ''
  ].filter(Boolean);
  return [...modifiers, normalizedKey].join('+');
}

function normalizeShortcutKey(key: string): string {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return '';
  if (key === ' ') return 'Space';
  if (key === '=' || key === 'Add') return '+';
  if (key === 'Subtract') return '-';
  if (key.length === 1) return key.toUpperCase();
  const aliases: Record<string, string> = {
    Esc: 'Escape',
    Del: 'Delete',
    Left: 'ArrowLeft',
    Right: 'ArrowRight',
    Up: 'ArrowUp',
    Down: 'ArrowDown'
  };
  return aliases[key] ?? key;
}

function mediaStatusText(media: MediaItem, t: (key: TextKey, params?: Record<string, string | number>) => string): string {
  if (media.importStatus === 'importing') return t('importing', { progress: Math.round(media.importProgress ?? 0) });
  if (media.importStatus === 'error') return media.importError ?? t('importFailed');
  return t('frames', { count: media.frames.length });
}

function replaceImportedMedia(media: MediaItem[], event: Extract<MediaImportEvent, { type: 'done' | 'partial' }>): MediaItem[] {
  let replaced = false;
  const nextMedia = media.map((item) => {
    const samePlaceholder = event.mediaId ? item.id === event.mediaId : false;
    const sameFinalMedia = item.id === event.media.id;
    const samePath = normalizePath(item.path) === normalizePath(event.media.path);
    if (samePlaceholder || sameFinalMedia || samePath) {
      replaced = true;
      return event.media;
    }
    return item;
  });
  return replaced ? nextMedia : [...nextMedia, event.media];
}

function mediaUrl(filePath: string): string {
  return window.labelingEasier?.mediaUrl(filePath) ?? `labeling-easier-media://file/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`;
}

function nextAnnotationName(media: MediaItem, frame: FrameRecord): string {
  return annotationNameAt(media, frame, frame.annotations.length + 1);
}

function annotationNameAt(media: MediaItem, frame: FrameRecord, boxIndex: number): string {
  const prefix = sanitizePrefix(media.annotationNamePrefix || basenameWithoutExt(media.name));
  return `${prefix}_${String(frame.index + 1).padStart(6, '0')}_${String(boxIndex).padStart(2, '0')}`;
}

function applyAiDetections(project: Project, frameId: string, detections: AiDetection[]): Project {
  const media = project.media.find((item) => item.frames.some((frame) => frame.id === frameId));
  const frame = media?.frames.find((item) => item.id === frameId);
  if (!media || !frame) return project;
  const classes = ensureDetectionClasses(project.classes, detections);
  const manualAnnotations = frame.annotations.filter((annotation) => annotation.source !== 'ai');
  const timestamp = nowIso();
  const aiAnnotations = detections.map((detection, index): Annotation => {
    const klass = classes.find((item) => item.name.toLowerCase() === detection.className.toLowerCase()) ?? classes[0];
    return {
      id: aiAnnotationId(frameId, index),
      name: annotationNameAt(media, frame, manualAnnotations.length + index + 1),
      frameId,
      classId: klass.id,
      bbox: clampBbox(detection.bbox, media.width, media.height),
      confidence: detection.confidence,
      source: 'ai',
      reviewState: 'unreviewed_ai',
      updatedAt: timestamp
    };
  });
  return {
    ...project,
    classes,
    media: project.media.map((item) =>
      item.id === media.id
        ? {
            ...item,
            frames: item.frames.map((candidate) =>
              candidate.id === frameId
                ? { ...candidate, reviewState: 'unreviewed_ai', annotations: [...manualAnnotations, ...aiAnnotations] }
                : candidate
            )
          }
        : item
    ),
    updatedAt: timestamp
  };
}

function ensureDetectionClasses(classes: LabelClass[], detections: AiDetection[]): LabelClass[] {
  const nextClasses = [...classes];
  for (const detection of detections) {
    if (nextClasses.some((klass) => klass.name.toLowerCase() === detection.className.toLowerCase())) continue;
    nextClasses.push({
      id: stableId('class', [detection.className]),
      name: detection.className,
      color: CLASS_COLORS[nextClasses.length % CLASS_COLORS.length]
    });
  }
  return nextClasses;
}

function aiAnnotationId(frameId: string, index: number): string {
  return stableId('ai-ann', [frameId, index]);
}

function normalizeBbox(a: Point, b: Point): Bbox {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  };
}

function resizeBbox(initial: Bbox, handle: ResizeHandle, point: Point): Bbox {
  const left = handle === 'tl' || handle === 'bl' || handle === 'l' ? point.x : initial.x;
  const right = handle === 'tr' || handle === 'br' || handle === 'r' ? point.x : initial.x + initial.width;
  const top = handle === 'tl' || handle === 'tr' || handle === 't' ? point.y : initial.y;
  const bottom = handle === 'bl' || handle === 'br' || handle === 'b' ? point.y : initial.y + initial.height;
  return normalizeBbox({ x: left, y: top }, { x: right, y: bottom });
}

function moveBbox(bbox: Bbox, dx: number, dy: number): Bbox {
  return { ...bbox, x: bbox.x + dx, y: bbox.y + dy };
}

function clampBbox(bbox: Bbox, width: number, height: number): Bbox {
  if (!width || !height) return bbox;
  const boxWidth = Math.min(Math.max(1, bbox.width), width);
  const boxHeight = Math.min(Math.max(1, bbox.height), height);
  return {
    x: clamp(bbox.x, 0, width - boxWidth),
    y: clamp(bbox.y, 0, height - boxHeight),
    width: boxWidth,
    height: boxHeight
  };
}

function handlePoint(bbox: Bbox, handle: ResizeHandle): Point {
  const x =
    handle === 'tl' || handle === 'bl' || handle === 'l'
      ? bbox.x
      : handle === 'tr' || handle === 'br' || handle === 'r'
        ? bbox.x + bbox.width
        : bbox.x + bbox.width / 2;
  const y =
    handle === 'tl' || handle === 'tr' || handle === 't'
      ? bbox.y
      : handle === 'bl' || handle === 'br' || handle === 'b'
        ? bbox.y + bbox.height
        : bbox.y + bbox.height / 2;
  return { x, y };
}

function edgeHitRect(bbox: Bbox, handle: ResizeHandle, hitSize: number): Bbox {
  if (handle === 't') {
    return { x: bbox.x, y: bbox.y - hitSize / 2, width: bbox.width, height: hitSize };
  }
  if (handle === 'b') {
    return { x: bbox.x, y: bbox.y + bbox.height - hitSize / 2, width: bbox.width, height: hitSize };
  }
  if (handle === 'l') {
    return { x: bbox.x - hitSize / 2, y: bbox.y, width: hitSize, height: bbox.height };
  }
  if (handle === 'r') {
    return { x: bbox.x + bbox.width - hitSize / 2, y: bbox.y, width: hitSize, height: bbox.height };
  }
  return { x: bbox.x, y: bbox.y, width: 0, height: 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizePrefix(value: string): string {
  return (value || 'box').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'box';
}

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function basenameWithoutExt(filePath: string): string {
  const name = basename(filePath);
  const dotIndex = name.lastIndexOf('.');
  return dotIndex > 0 ? name.slice(0, dotIndex) : name;
}

function modelFileName(modelPath: string, t: (key: TextKey, params?: Record<string, string | number>) => string): string {
  return modelPath ? basename(modelPath) : t('noModelSelected');
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}
