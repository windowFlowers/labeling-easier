import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/renderer/App';
import type { AiWorkerEvent } from '../../src/main/services/aiWorker';
import type { MediaImportEvent } from '../../src/preload/preload';
import type { Annotation, MediaItem, Project } from '../../src/shared/types';

const imageMedia: MediaItem = {
  id: 'media-image',
  name: 'frame001.jpg',
  path: 'C:/dataset/frame001.jpg',
  type: 'image',
  width: 100,
  height: 100,
  frames: [{ id: 'frame-image', mediaId: 'media-image', index: 0, timestampMs: 0, imagePath: 'C:/dataset/frame001.jpg', reviewState: 'reviewed', annotations: [] }]
};

const annotatedImageMedia: MediaItem = {
  ...imageMedia,
  frames: [{
    ...imageMedia.frames[0],
    annotations: [{
      id: 'ann-1',
      name: 'frame001_000001_01',
      frameId: 'frame-image',
      classId: 'class-drone',
      bbox: { x: 10, y: 10, width: 30, height: 20 },
      source: 'manual',
      reviewState: 'reviewed',
      updatedAt: '2026-05-26T00:00:00.000Z'
    }]
  }]
};

const firstFrameAnnotation: Annotation = {
  id: 'ann-prev',
  name: 'clip_000001_01',
  frameId: 'frame-video-1',
  classId: 'class-drone',
  bbox: { x: 10, y: 10, width: 30, height: 20 },
  source: 'manual',
  reviewState: 'reviewed',
  updatedAt: '2026-05-26T00:00:00.000Z'
};

const videoMedia: MediaItem = {
  id: 'media-video',
  name: 'clip.mp4',
  path: 'C:/dataset/clip.mp4',
  type: 'video',
  annotationNamePrefix: 'clip',
  width: 100,
  height: 100,
  fps: 25,
  durationMs: 80,
  frames: [
    { id: 'frame-video-1', mediaId: 'media-video', index: 0, timestampMs: 0, imagePath: 'C:/cache/frame-000001.jpg', reviewState: 'reviewed', annotations: [] },
    { id: 'frame-video-2', mediaId: 'media-video', index: 1, timestampMs: 40, imagePath: 'C:/cache/frame-000002.jpg', reviewState: 'reviewed', annotations: [] }
  ]
};

const annotatedVideoMedia: MediaItem = {
  ...videoMedia,
  frames: [
    { ...videoMedia.frames[0], annotations: [firstFrameAnnotation] },
    videoMedia.frames[1]
  ]
};

const secondVideoMedia: MediaItem = {
  id: 'media-video-2',
  name: 'clip2.mp4',
  path: 'C:/dataset/clip2.mp4',
  type: 'video',
  annotationNamePrefix: 'clip2',
  width: 100,
  height: 100,
  fps: 25,
  durationMs: 40,
  frames: [
    { id: 'frame-video-3', mediaId: 'media-video-2', index: 0, timestampMs: 0, imagePath: 'C:/cache2/frame-000001.jpg', reviewState: 'reviewed', annotations: [] }
  ]
};

const longVideoMedia: MediaItem = {
  ...videoMedia,
  id: 'media-long-video',
  name: 'long.mp4',
  path: 'C:/dataset/long.mp4',
  frames: Array.from({ length: 20 }, (_item, index) => ({
    id: `frame-long-${index + 1}`,
    mediaId: 'media-long-video',
    index,
    timestampMs: index * 40,
    imagePath: `C:/cache-long/frame-${String(index + 1).padStart(6, '0')}.jpg`,
    reviewState: 'reviewed' as const,
    annotations: []
  }))
};

const importingVideo = {
  id: 'media-importing',
  name: 'slow.mp4',
  path: 'C:/dataset/slow.mp4',
  type: 'video',
  importStatus: 'importing',
  importProgress: 0,
  annotationNamePrefix: 'slow',
  width: 0,
  height: 0,
  frames: []
} as unknown as MediaItem;

function projectFixture(name = 'Opened Dataset'): Project {
  return {
    id: 'project-1',
    name,
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    classes: [
      { id: 'class-drone', name: 'drone', color: '#c96442' },
      { id: 'class-bird', name: 'bird', color: '#5e5d59' }
    ],
    media: [],
    settings: { pythonPath: 'python', modelPath: '', ffmpegPath: 'ffmpeg', confidenceThreshold: 0.25 },
    exportHistory: []
  };
}

describe('desktop bridge actions', () => {
  beforeEach(() => {
    delete window.labelingEasier;
    localStorage.clear();
    vi.useRealTimers();
  });

  it('reports when desktop file actions are unavailable', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));

    expect(screen.getByText(/desktop app/i)).toBeInTheDocument();
  });

  it('opens folders and files through direct topbar buttons', async () => {
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture('Opened Dataset'), media: [imageMedia] }),
      openFile: vi.fn().mockResolvedValue([videoMedia]),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];
    const api = window.labelingEasier as NonNullable<Window['labelingEasier']>;

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    expect(await screen.findByText('Opened Opened Dataset')).toBeInTheDocument();
    expect(api.openFolder).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open File' }));
    expect(await screen.findByText('clip.mp4')).toBeInTheDocument();
  });

  it('updates importing media when async video progress and completion events arrive', async () => {
    let mediaListener: ((event: MediaImportEvent) => void) | undefined;
    window.labelingEasier = {
      openFile: vi.fn().mockResolvedValue([importingVideo]),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn((listener: (event: unknown) => void) => {
        mediaListener = listener;
        return () => {};
      }),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open File' }));

    expect(await screen.findByText('slow.mp4')).toBeInTheDocument();
    expect(screen.getAllByText('Importing 0%').length).toBeGreaterThan(0);

    act(() => {
      mediaListener?.({ type: 'progress', mediaId: 'media-importing', progress: 42 });
    });
    expect((await screen.findAllByText('Importing 42%')).length).toBeGreaterThan(0);

    act(() => {
      mediaListener?.({
        type: 'partial',
        mediaId: 'media-importing',
        media: {
          ...videoMedia,
          id: 'media-importing',
          importStatus: 'importing',
          importProgress: 42,
          frames: [videoMedia.frames[0]]
        }
      });
    });
    expect(await screen.findByText('1 media / 1 frames')).toBeInTheDocument();
    expect(await screen.findByAltText('frame-000001.jpg')).toBeInTheDocument();

    act(() => {
      mediaListener?.({ type: 'done', mediaId: 'media-importing', media: videoMedia });
    });
    expect(await screen.findByText('2 frames')).toBeInTheDocument();
  });
});

describe('Labeling Easier editor shell', () => {
  beforeEach(() => {
    delete window.labelingEasier;
    localStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts empty without demo frames or new/python controls', () => {
    render(<App />);

    expect(screen.getByText('Labeling Easier')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open File' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Folder' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'File' })).not.toBeInTheDocument();
    expect(screen.getByText('Dataset')).toBeInTheDocument();
    expect(screen.getByText('Canvas')).toBeInTheDocument();
    expect(screen.getByText('Labels')).toBeInTheDocument();
    expect(screen.getAllByText('No media loaded')).toHaveLength(2);
    expect(screen.queryByText('Anti UAV Review Set')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open project' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import folder' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Python')).not.toBeInTheDocument();
    expect(document.querySelector('.statusbar')).not.toBeInTheDocument();
  });

  it('enters draw mode with F but ignores shortcuts while editing inputs', async () => {
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [videoMedia] }),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await screen.findByAltText('frame-000001.jpg');

    fireEvent.keyDown(window, { key: 'f' });
    expect(screen.getByRole('button', { name: 'Draw bbox (F)' })).toHaveClass('active-tool');

    fireEvent.click(screen.getByRole('button', { name: 'Draw bbox (F)' }));
    expect(screen.getByRole('button', { name: 'Draw bbox (F)' })).not.toHaveClass('active-tool');

    const prefix = screen.getByLabelText('Name prefix');
    prefix.focus();
    fireEvent.keyDown(prefix, { key: 'f' });
    expect(screen.getByRole('button', { name: 'Draw bbox (F)' })).not.toHaveClass('active-tool');
  });

  it('opens settings, switches language, and persists Chinese UI labels', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '中文' }));

    expect(localStorage.getItem('labeling-easier.language')).toBe('zh');
    expect(screen.getByRole('dialog', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开文件' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开文件夹' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '常规' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '外观' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '键盘快捷键' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI 标注' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '命名' })).toBeInTheDocument();
  });

  it('customizes shortcuts, blocks conflicts, and resets defaults', async () => {
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [videoMedia] }),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Draw bbox shortcut' }));
    fireEvent.keyDown(window, { key: 'b' });
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(localStorage.getItem('labeling-easier.shortcuts')).toContain('"draw":"B"');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Copy previous boxes shortcut' }));
    fireEvent.keyDown(window, { key: 'b' });
    expect(screen.getByText(/already used/i)).toBeInTheDocument();
    expect(localStorage.getItem('labeling-easier.shortcuts')).not.toContain('"copyPrevious":"B"');

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await screen.findByAltText('frame-000001.jpg');

    fireEvent.keyDown(window, { key: 'f' });
    expect(screen.getByRole('button', { name: 'Draw bbox (B)' })).not.toHaveClass('active-tool');
    fireEvent.keyDown(window, { key: 'b' });
    expect(screen.getByRole('button', { name: 'Draw bbox (B)' })).toHaveClass('active-tool');

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset shortcuts' }));
    expect(localStorage.getItem('labeling-easier.shortcuts')).toContain('"draw":"F"');
  });

  it('stores general, appearance, and system theme settings from the fixed settings dialog', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveClass('settings-dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Dark mode' }));

    expect(localStorage.getItem('labeling-easier.themeMode')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByRole('switch', { name: 'Follow system theme' }));
    expect(localStorage.getItem('labeling-easier.themeMode')).toBe('system');

    fireEvent.click(screen.getByRole('button', { name: 'General' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Auto-save labels and project state' }));
    expect(localStorage.getItem('labeling-easier.autoSave')).toBe('false');
    fireEvent.click(screen.getByRole('switch', { name: 'Auto-mark reviewed after manual edits' }));
    expect(localStorage.getItem('labeling-easier.autoReviewManualEdits')).toBe('true');
    fireEvent.click(screen.getByRole('switch', { name: 'Auto-mark reviewed after viewing a frame' }));
    expect(localStorage.getItem('labeling-easier.autoReviewSeenFrames')).toBe('true');
  });

  it('shows opened images as real image elements', async () => {
    window.labelingEasier = {
      openFile: vi.fn().mockResolvedValue([imageMedia]),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open File' }));

    const image = await screen.findByAltText('frame001.jpg');
    expect(image).toHaveAttribute('src', 'labeling-easier-media://file/C%3A%2Fdataset%2Fframe001.jpg');
    expect(document.querySelector('.frame-row img')).toHaveAttribute('src', 'labeling-easier-media://file/C%3A%2Fdataset%2Fframe001.jpg');
    expect(document.querySelector('.thumb img')).toHaveAttribute('src', 'labeling-easier-media://file/C%3A%2Fdataset%2Fframe001.jpg');
  });

  it('creates named boxes and allows editing name and class', async () => {
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [{ ...imageMedia, annotationNamePrefix: 'frame001' }] }),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await screen.findByAltText('frame001.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Draw bbox (F)' }));
    const overlay = screen.getByTestId('annotation-overlay');
    vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      toJSON: () => {}
    });

    fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(overlay, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(overlay);

    expect(await screen.findByDisplayValue('frame001_000001_01')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Box name'), { target: { value: 'custom_box' } });
    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'class-bird' } });

    expect(screen.getByDisplayValue('custom_box')).toBeInTheDocument();
    expect(screen.getByLabelText('Class')).toHaveValue('class-bird');
  });

  it('uses the editable video prefix for new box names and shows real frame thumbnails', async () => {
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [videoMedia] }),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await screen.findByAltText('frame-000001.jpg');
    expect(screen.getByLabelText('Name prefix')).toHaveValue('clip');
    fireEvent.change(screen.getByLabelText('Name prefix'), { target: { value: 'mission 7' } });

    expect(document.querySelectorAll('.frame-row img')).toHaveLength(2);
    expect(document.querySelectorAll('.thumb img')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Draw bbox (F)' }));
    const overlay = screen.getByTestId('annotation-overlay');
    vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      toJSON: () => {}
    });

    fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(overlay, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(overlay);

    expect(await screen.findByDisplayValue('mission_7_000001_01')).toBeInTheDocument();
  });

  it('switches and removes media without deleting the rest of the project', async () => {
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [videoMedia, secondVideoMedia] }),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await screen.findByText('clip.mp4');
    expect(screen.getByText('clip2.mp4')).toBeInTheDocument();
    expect(document.querySelectorAll('.thumb')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Select clip2.mp4' }));
    expect(await screen.findByTestId('active-frame')).toHaveTextContent('Frame 1 / 1');
    expect(document.querySelectorAll('.thumb')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remove clip.mp4' }));
    expect(screen.queryByText('clip.mp4')).not.toBeInTheDocument();
    expect(screen.getByText('clip2.mp4')).toBeInTheDocument();
  });

  it('keeps the active frame centered in the filmstrip when annotation progress changes', async () => {
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [longVideoMedia] }),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await screen.findByText('long.mp4');

    const filmstrip = screen.getByLabelText('Video frame strip');
    const scrollTo = vi.fn();
    filmstrip.scrollTo = scrollTo;
    Object.defineProperty(filmstrip, 'clientWidth', { configurable: true, value: 200 });
    const target = document.querySelector('[data-frame-id="frame-long-12"]') as HTMLElement;
    Object.defineProperty(target, 'offsetLeft', { configurable: true, value: 902 });
    Object.defineProperty(target, 'offsetWidth', { configurable: true, value: 74 });

    fireEvent.click(target);

    await waitFor(() =>
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 839, behavior: 'smooth' }))
    );
    expect(filmstrip.scrollLeft).toBe(839);
  });

  it('zooms the canvas and edits boxes by dragging handles and moving the box', async () => {
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [annotatedImageMedia] }),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await screen.findByDisplayValue('frame001_000001_01');

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('110%')).toBeInTheDocument();

    const surface = screen.getByTestId('image-surface');
    expect(surface).toHaveStyle({ transform: 'translate(0px, 0px) scale(1.1)' });

    const bottomRight = await screen.findByTestId('resize-hit-br-ann-1');
    const bottomRightVisual = await screen.findByTestId('resize-br-ann-1');
    expect(bottomRight).toHaveAttribute('r', expect.stringMatching(/^2[6-8]\./));
    expect(bottomRightVisual).toHaveAttribute('r', expect.stringMatching(/^4\./));
    fireEvent.pointerDown(bottomRight, { clientX: 40, clientY: 30 });
    fireEvent.pointerMove(screen.getByTestId('annotation-overlay'), { clientX: 60, clientY: 55 });
    fireEvent.pointerUp(screen.getByTestId('annotation-overlay'));
    expect(screen.getByLabelText('width')).toHaveValue(50);
    expect(screen.getByLabelText('height')).toHaveValue(45);

    const box = screen.getByTestId('bbox-ann-1');
    expect(screen.getByTestId('bbox-hit-ann-1')).toBeInTheDocument();
    fireEvent.pointerDown(box, { clientX: 15, clientY: 15 });
    fireEvent.pointerMove(screen.getByTestId('annotation-overlay'), { clientX: 20, clientY: 25 });
    fireEvent.pointerUp(screen.getByTestId('annotation-overlay'));
    expect(screen.getByLabelText('x')).toHaveValue(15);
    expect(screen.getByLabelText('y')).toHaveValue(20);

    const rightEdge = await screen.findByTestId('resize-hit-r-ann-1');
    fireEvent.pointerDown(rightEdge, { clientX: 65, clientY: 42 });
    fireEvent.pointerMove(screen.getByTestId('annotation-overlay'), { clientX: 80, clientY: 42 });
    fireEvent.pointerUp(screen.getByTestId('annotation-overlay'));
    expect(screen.getByLabelText('width')).toHaveValue(65);
    expect(screen.getByLabelText('height')).toHaveValue(45);
  });

  it('pans the canvas by dragging blank space in select mode', async () => {
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [imageMedia] }),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await screen.findByAltText('frame001.jpg');
    const overlay = screen.getByTestId('annotation-overlay');
    vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      toJSON: () => {}
    });

    fireEvent.pointerDown(overlay, { clientX: 20, clientY: 20 });
    fireEvent.pointerMove(overlay, { clientX: 70, clientY: 55 });
    fireEvent.pointerUp(overlay);

    expect(screen.getByTestId('image-surface')).toHaveStyle({ transform: 'translate(50px, 35px) scale(1)' });
  });

  it('runs AI on the active media with confidence settings, writes detections, and shows progress', async () => {
    let aiListener: ((event: AiWorkerEvent) => void) | undefined;
    const runAi = vi.fn().mockResolvedValue({ started: true });
    localStorage.setItem('labeling-easier.aiConfidenceThreshold', '0.66');
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [videoMedia, secondVideoMedia] }),
      runAi,
      bundledModelPath: vi.fn().mockResolvedValue('C:/app/resources/models/yolov8n.pt'),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn((listener: (event: AiWorkerEvent) => void) => {
        aiListener = listener;
        return () => {};
      })
    } as unknown as Window['labelingEasier'];

    render(<App />);

    await screen.findByText('yolov8n.pt');
    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await screen.findByText('clip.mp4');
    fireEvent.click(screen.getByRole('button', { name: 'Run AI labels' }));

    expect(runAi).toHaveBeenCalledWith(
      expect.objectContaining({ modelPath: 'C:/app/resources/models/yolov8n.pt', confidenceThreshold: 0.66 }),
      videoMedia.frames.map((frame) => ({ frameId: frame.id, imagePath: frame.imagePath, mediaId: videoMedia.id, index: frame.index }))
    );
    expect(screen.getAllByText('AI labeling 0/2').length).toBeGreaterThan(0);

    act(() => {
      aiListener?.({ type: 'progress', completed: 1, total: 2 });
    });
    expect(screen.getAllByText('AI labeling 1/2').length).toBeGreaterThan(0);

    act(() => {
      aiListener?.({
        type: 'result',
        frameId: 'frame-video-1',
        detections: [{ className: 'car', confidence: 0.9, bbox: { x: 5, y: 6, width: 20, height: 12 } }]
      });
    });

    expect(await screen.findByText(/car · ai · 90%/)).toBeInTheDocument();
    expect(screen.getByLabelText('Class')).toHaveTextContent('car');
    expect(screen.getByTestId('review-state')).toHaveTextContent('unreviewed_ai');
  });

  it('copies previous frame boxes with C and undoes the copy with Ctrl+Z', async () => {
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [annotatedVideoMedia] }),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await screen.findByDisplayValue('clip_000001_01');
    fireEvent.click(screen.getByRole('button', { name: 'Next frame' }));
    expect(screen.getByText('No boxes')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'c' });
    expect(await screen.findByDisplayValue('clip_000002_01')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.queryByDisplayValue('clip_000002_01')).not.toBeInTheDocument();
    expect(screen.getByText('No boxes')).toBeInTheDocument();
  });

  it('auto-marks manual edits as reviewed when the setting is enabled', async () => {
    localStorage.setItem('labeling-easier.autoReviewManualEdits', 'true');
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [annotatedVideoMedia] }),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await screen.findByDisplayValue('clip_000001_01');
    fireEvent.click(screen.getByRole('button', { name: 'Next frame' }));
    fireEvent.keyDown(window, { key: 'c' });

    expect(await screen.findByDisplayValue('clip_000002_01')).toBeInTheDocument();
    expect(screen.getByTestId('review-state')).toHaveTextContent('reviewed');
  });

  it('auto-marks viewed frames as reviewed when the setting is enabled', async () => {
    localStorage.setItem('labeling-easier.autoReviewSeenFrames', 'true');
    const unreviewedMedia: MediaItem = {
      ...videoMedia,
      frames: [{ ...videoMedia.frames[0], reviewState: 'unreviewed_ai' }, videoMedia.frames[1]]
    };
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [unreviewedMedia] }),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    expect(await screen.findByTestId('review-state')).toHaveTextContent('unreviewed_ai');

    await waitFor(() => expect(screen.getByTestId('review-state')).toHaveTextContent('reviewed'), { timeout: 1500 });
  });

  it('persists local model selection and removes the right-panel advanced download control', async () => {
    window.labelingEasier = {
      bundledModelPath: vi.fn().mockResolvedValue('C:/app/resources/models/yolov8n.pt'),
      chooseModelFile: vi.fn().mockResolvedValue('C:/models/custom.pt'),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    expect(await screen.findByText('yolov8n.pt')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose local model' }));
    expect(await screen.findByText('custom.pt')).toBeInTheDocument();
    expect(localStorage.getItem('labeling-easier.modelPath')).toBe('C:/models/custom.pt');
    expect(screen.queryByLabelText('Download advanced model')).not.toBeInTheDocument();
  });

  it('restores the last session and still saves a session snapshot when autosave is disabled', async () => {
    localStorage.setItem('labeling-easier.autoSave', 'false');
    const autoSaveProject = vi.fn().mockResolvedValue({ saved: true });
    const saveSessionState = vi.fn().mockResolvedValue({ saved: true });
    window.labelingEasier = {
      loadSessionState: vi.fn().mockResolvedValue({
        project: { ...projectFixture('Restored Dataset'), media: [videoMedia] },
        activeMediaId: videoMedia.id,
        activeFrameId: videoMedia.frames[1].id,
        selectedAnnotationId: '',
        zoom: 2,
        pan: { x: 11, y: 22 }
      }),
      saveSessionState,
      autoSaveProject,
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    expect(await screen.findByText('Opened Restored Dataset')).toBeInTheDocument();
    expect(await screen.findByTestId('active-frame')).toHaveTextContent('Frame 2 / 2');
    expect(screen.getByText('200%')).toBeInTheDocument();

    await waitFor(() => expect(saveSessionState).toHaveBeenCalledWith(expect.objectContaining({ activeFrameId: 'frame-video-2' })));
    expect(autoSaveProject).not.toHaveBeenCalled();
  });

  it('uses naming presets and custom templates for new boxes', async () => {
    localStorage.setItem('labeling-easier.namingPreset', 'custom');
    localStorage.setItem('labeling-easier.namingTemplate', '{prefix}{frame:000000}');
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [videoMedia] }),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await screen.findByAltText('frame-000001.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Draw bbox (F)' }));
    const overlay = screen.getByTestId('annotation-overlay');
    vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      toJSON: () => {}
    });

    fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(overlay, { clientX: 50, clientY: 50 });
    fireEvent.pointerUp(overlay);

    expect(await screen.findByDisplayValue('clip000001')).toBeInTheDocument();
  });

  it('filters AI frames by saved label mode and asks when no mode is configured', async () => {
    localStorage.setItem('labeling-easier.aiLabelMode', 'emptyOnly');
    const runAi = vi.fn().mockResolvedValue({ started: true });
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [annotatedVideoMedia] }),
      runAi,
      bundledModelPath: vi.fn().mockResolvedValue('C:/app/resources/models/yolov8n.pt'),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    await screen.findByText('yolov8n.pt');
    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await screen.findByText('clip.mp4');
    fireEvent.click(screen.getByRole('button', { name: 'Run AI labels' }));

    expect(runAi).toHaveBeenCalledWith(
      expect.anything(),
      [videoMedia.frames[1]].map((frame) => ({ frameId: frame.id, imagePath: frame.imagePath, mediaId: videoMedia.id, index: frame.index }))
    );
  });

  it('asks for an AI write strategy on labeled media and can remember the choice', async () => {
    const runAi = vi.fn().mockResolvedValue({ started: true });
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [annotatedVideoMedia] }),
      runAi,
      bundledModelPath: vi.fn().mockResolvedValue('C:/app/resources/models/yolov8n.pt'),
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    await screen.findByText('yolov8n.pt');
    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await screen.findByText('clip.mp4');
    fireEvent.click(screen.getByRole('button', { name: 'Run AI labels' }));

    expect(screen.getByRole('dialog', { name: 'AI labeling mode' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Remember this choice' }));
    fireEvent.click(screen.getByRole('button', { name: /Only unlabeled frames/ }));

    expect(localStorage.getItem('labeling-easier.aiLabelMode')).toBe('emptyOnly');
    expect(runAi).toHaveBeenCalledWith(
      expect.anything(),
      [videoMedia.frames[1]].map((frame) => ({ frameId: frame.id, imagePath: frame.imagePath, mediaId: videoMedia.id, index: frame.index }))
    );
  });

  it('exports labels through the desktop export writer instead of only previewing counts', async () => {
    const exportToDirectory = vi.fn().mockResolvedValue({ saved: true, outputPath: 'C:/exports', fileCount: 2, format: 'yolo' });
    window.labelingEasier = {
      openFolder: vi.fn().mockResolvedValue({ ...projectFixture(), media: [annotatedVideoMedia] }),
      exportToDirectory,
      mediaUrl: vi.fn((filePath: string) => `labeling-easier-media://file/${encodeURIComponent(filePath)}`),
      onMediaImportEvent: vi.fn(() => () => {}),
      onAiEvent: vi.fn(() => () => {})
    } as unknown as Window['labelingEasier'];

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await screen.findByText('clip.mp4');
    fireEvent.click(screen.getByRole('button', { name: 'Export labels' }));

    expect(exportToDirectory).toHaveBeenCalledWith(expect.objectContaining({ media: [annotatedVideoMedia] }), 'yolo');
    expect(await screen.findByText(/Exported 2 YOLO txt file/)).toBeInTheDocument();
  });
});
