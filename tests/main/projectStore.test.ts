import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  loadOrCreateProjectInDirectory,
  loadProjectFromFile,
  mergeProjectMedia,
  PROJECT_FILE_NAME,
  saveProjectToDirectory,
  saveProjectToFile
} from '../../src/main/services/projectStore';
import { createImageMedia } from '../../src/main/services/mediaService';

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe('project store', () => {
  it('creates an empty project with default external dependency settings', () => {
    const project = createEmptyProject('Anti UAV');

    expect(project.name).toBe('Anti UAV');
    expect(project.classes[0].name).toBe('object');
    expect(project.settings.pythonPath).toBe('python');
    expect(project.settings.ffmpegPath).toBe('ffmpeg');
    expect(project.media).toEqual([]);
  });

  it('saves and loads a label project as JSON', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'labeling-easier-'));
    const filePath = path.join(tempDir, 'sample.labelproj');
    const project = createEmptyProject('Round Trip');

    await saveProjectToFile(project, filePath);
    const raw = await readFile(filePath, 'utf8');
    const loaded = await loadProjectFromFile(filePath);

    expect(JSON.parse(raw).name).toBe('Round Trip');
    expect(loaded).toEqual(project);
  });

  it('uses a fixed project file inside a selected folder', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'labeling-easier-folder-'));
    const created = await loadOrCreateProjectInDirectory(tempDir);
    const projectFilePath = path.join(tempDir, PROJECT_FILE_NAME);

    created.name = 'Folder Project';
    await saveProjectToDirectory(created, tempDir);
    const loaded = await loadOrCreateProjectInDirectory(tempDir);

    expect(projectFilePath.endsWith('labeling-easier.labelproj')).toBe(true);
    expect(loaded.name).toBe('Folder Project');
  });

  it('normalizes legacy projects without annotation names or media prefixes', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'labeling-easier-legacy-'));
    const filePath = path.join(tempDir, PROJECT_FILE_NAME);
    const legacyProject = {
      ...createEmptyProject('Legacy Project'),
      media: [
        {
          id: 'media-1',
          name: 'clip.mp4',
          path: 'C:/data/clip.mp4',
          type: 'video',
          width: 100,
          height: 100,
          frames: [
            {
              id: 'frame-1',
              mediaId: 'media-1',
              index: 2,
              timestampMs: 80,
              imagePath: 'C:/cache/frame-000003.jpg',
              reviewState: 'modified',
              annotations: [
                {
                  id: 'ann-1',
                  frameId: 'frame-1',
                  classId: 'class-object',
                  bbox: { x: 1, y: 2, width: 3, height: 4 },
                  source: 'manual',
                  reviewState: 'modified',
                  updatedAt: '2026-05-26T00:00:00.000Z'
                }
              ]
            }
          ]
        }
      ]
    };
    await writeFile(filePath, JSON.stringify(legacyProject), 'utf8');

    const loaded = await loadProjectFromFile(filePath);

    expect(loaded.media[0].annotationNamePrefix).toBe('clip');
    expect(loaded.media[0].frames[0].annotations[0].name).toBe('clip_000003_01');
  });

  it('merges newly scanned folder media without duplicating existing paths', () => {
    const project = createEmptyProject('Folder Project');
    const existing = createImageMedia('C:/dataset/a.jpg', 100, 100);
    const duplicate = createImageMedia('C:/dataset/a.jpg', 100, 100);
    const fresh = createImageMedia('C:/dataset/b.jpg', 200, 100);

    const merged = mergeProjectMedia({ ...project, media: [existing] }, [duplicate, fresh]);

    expect(merged.media.map((media) => media.path)).toEqual(['C:/dataset/a.jpg', 'C:/dataset/b.jpg']);
    expect(merged.media[0].id).toBe(existing.id);
  });
});
