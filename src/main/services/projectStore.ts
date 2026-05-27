import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nowIso, stableId } from '../../shared/ids';
import type { Project } from '../../shared/types';

export const PROJECT_FILE_NAME = 'labeling-easier.labelproj';

export function createEmptyProject(name: string): Project {
  const timestamp = nowIso();
  return {
    id: stableId('project', [name, timestamp]),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    classes: [
      {
        id: 'class-object',
        name: 'object',
        color: '#c96442'
      }
    ],
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

export async function loadOrCreateProjectInDirectory(directoryPath: string): Promise<Project> {
  const projectPath = path.join(directoryPath, PROJECT_FILE_NAME);
  try {
    return await loadProjectFromFile(projectPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return createEmptyProject(path.basename(directoryPath) || 'Untitled Dataset');
  }
}

export async function saveProjectToDirectory(project: Project, directoryPath: string): Promise<void> {
  await saveProjectToFile(project, path.join(directoryPath, PROJECT_FILE_NAME));
}

export function mergeProjectMedia(project: Project, media: Project['media']): Project {
  const existingPaths = new Set(project.media.map((item) => normalizePath(item.path)));
  const fresh = media.filter((item) => !existingPaths.has(normalizePath(item.path)));
  if (!fresh.length) return project;
  return {
    ...project,
    media: [...project.media, ...fresh],
    updatedAt: nowIso()
  };
}

export async function saveProjectToFile(project: Project, filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
}

export async function loadProjectFromFile(filePath: string): Promise<Project> {
  const raw = await readFile(filePath, 'utf8');
  return normalizeProject(JSON.parse(raw) as Project);
}

function normalizeProject(project: Project): Project {
  const defaultProject = createEmptyProject(project.name || 'Untitled Dataset');
  return {
    ...project,
    classes: project.classes?.length ? project.classes : defaultProject.classes,
    settings: { ...defaultProject.settings, ...(project.settings ?? {}) },
    media: (project.media ?? []).map((media) => {
      const annotationNamePrefix = media.annotationNamePrefix ?? basenameWithoutExt(media.name || media.path);
      return {
        ...media,
        annotationNamePrefix,
        frames: (media.frames ?? []).map((frame) => ({
          ...frame,
          annotations: (frame.annotations ?? []).map((annotation, index) => ({
            ...annotation,
            name: annotation.name || makeAnnotationName(annotationNamePrefix, frame.index, index)
          }))
        }))
      };
    })
  };
}

function makeAnnotationName(prefix: string, frameIndex: number, annotationIndex: number): string {
  return `${sanitizePrefix(prefix)}_${String(frameIndex + 1).padStart(6, '0')}_${String(annotationIndex + 1).padStart(2, '0')}`;
}

function sanitizePrefix(value: string): string {
  return (value || 'box').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'box';
}

function basenameWithoutExt(filePath: string): string {
  const parsed = path.parse(filePath);
  return parsed.name || parsed.base;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}
