import { denormalizeYoloBox, normalizeYoloBox } from './geometry';
import { nowIso, stableId } from './ids';
import type {
  Annotation,
  Bbox,
  CocoDataset,
  ExportedTextFile,
  FrameRecord,
  LabelClass,
  LabelMeFile,
  MediaItem,
  Project
} from './types';

const DEFAULT_COLORS = ['#c96442', '#5e5d59', '#87867f', '#30302e', '#b53333', '#d97757'];

export interface ImportYoloInput {
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  labelText: string;
  classNames: string[];
}

export function exportYolo(project: Project): ExportedTextFile[] {
  return project.media.flatMap((media) =>
    media.frames.map((frame) => ({
      path: `${basenameWithoutExt(frame.imagePath)}.txt`,
      content: frame.annotations
        .map((annotation) => {
          const classIndex = project.classes.findIndex((item) => item.id === annotation.classId);
          const box = normalizeYoloBox(annotation.bbox, media.width, media.height);
          return [
            Math.max(0, classIndex),
            box.centerX.toFixed(6),
            box.centerY.toFixed(6),
            box.width.toFixed(6),
            box.height.toFixed(6)
          ].join(' ');
        })
        .join('\n')
    }))
  );
}

export function importYolo(input: ImportYoloInput): Project {
  const classes = input.classNames.map((name, index) => makeClass(name, index));
  const media = makeImageMedia(input.imagePath, input.imageWidth, input.imageHeight);
  const frame = media.frames[0];
  frame.annotations = input.labelText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [classIndex, centerX, centerY, width, height] = line.split(/\s+/).map(Number);
      return makeAnnotation(
        makeAnnotationName(input.imagePath, index),
        frame.id,
        classes[classIndex]?.id ?? classes[0].id,
        denormalizeYoloBox({ centerX, centerY, width, height }, input.imageWidth, input.imageHeight),
        index,
        'imported'
      );
    });

  return makeProject('Imported YOLO Dataset', classes, [media]);
}

export function exportCoco(project: Project): CocoDataset {
  const categories = project.classes.map((item, index) => ({ id: index + 1, name: item.name }));
  const images: CocoDataset['images'] = [];
  const annotations: CocoDataset['annotations'] = [];
  let imageId = 1;
  let annotationId = 1;

  for (const media of project.media) {
    for (const frame of media.frames) {
      const currentImageId = imageId++;
      images.push({
        id: currentImageId,
        file_name: basename(frame.imagePath),
        width: media.width,
        height: media.height
      });

      for (const annotation of frame.annotations) {
        const categoryId = project.classes.findIndex((item) => item.id === annotation.classId) + 1;
        annotations.push({
          id: annotationId++,
          image_id: currentImageId,
          category_id: Math.max(1, categoryId),
          bbox: [annotation.bbox.x, annotation.bbox.y, annotation.bbox.width, annotation.bbox.height],
          area: annotation.bbox.width * annotation.bbox.height,
          iscrowd: 0,
          ...(annotation.confidence === undefined ? {} : { score: annotation.confidence })
        });
      }
    }
  }

  return { images, annotations, categories };
}

export function importCoco(dataset: CocoDataset): Project {
  const classes = dataset.categories.map((category, index) => makeClass(category.name, index));
  const media = dataset.images.map((image) => {
    const item = makeImageMedia(image.file_name, image.width, image.height);
    const frame = item.frames[0];
    frame.annotations = dataset.annotations
      .filter((annotation) => annotation.image_id === image.id)
      .map((annotation, index) =>
        makeAnnotation(
          makeAnnotationName(image.file_name, index),
          frame.id,
          classes[Math.max(0, annotation.category_id - 1)]?.id ?? classes[0].id,
          {
            x: annotation.bbox[0],
            y: annotation.bbox[1],
            width: annotation.bbox[2],
            height: annotation.bbox[3]
          },
          index,
          'imported',
          annotation.score
        )
      );
    return item;
  });

  return makeProject('Imported COCO Dataset', classes, media);
}

export function exportVoc(project: Project): ExportedTextFile[] {
  return project.media.flatMap((media) =>
    media.frames.map((frame) => ({
      path: `${basenameWithoutExt(frame.imagePath)}.xml`,
      content: [
        '<annotation>',
        `  <filename>${escapeXml(basename(frame.imagePath))}</filename>`,
        '  <size>',
        `    <width>${media.width}</width>`,
        `    <height>${media.height}</height>`,
        '    <depth>3</depth>',
        '  </size>',
        ...frame.annotations.flatMap((annotation) => {
          const klass = project.classes.find((item) => item.id === annotation.classId);
          const xmin = annotation.bbox.x;
          const ymin = annotation.bbox.y;
          const xmax = annotation.bbox.x + annotation.bbox.width;
          const ymax = annotation.bbox.y + annotation.bbox.height;
          return [
            '  <object>',
            `    <name>${escapeXml(klass?.name ?? 'unknown')}</name>`,
            '    <bndbox>',
            `      <xmin>${xmin}</xmin>`,
            `      <ymin>${ymin}</ymin>`,
            `      <xmax>${xmax}</xmax>`,
            `      <ymax>${ymax}</ymax>`,
            '    </bndbox>',
            '  </object>'
          ];
        }),
        '</annotation>'
      ].join('\n')
    }))
  );
}

export function importVoc(xml: string): Project {
  const fileName = readXmlValue(xml, 'filename') ?? 'imported.jpg';
  const width = Number(readXmlValue(xml, 'width') ?? 0);
  const height = Number(readXmlValue(xml, 'height') ?? 0);
  const objectBlocks = [...xml.matchAll(/<object>([\s\S]*?)<\/object>/g)].map((match) => match[1]);
  const classNames = [...new Set(objectBlocks.map((block) => readXmlValue(block, 'name') ?? 'unknown'))];
  const classes = classNames.map((name, index) => makeClass(name, index));
  const media = makeImageMedia(fileName, width, height);
  const frame = media.frames[0];
  frame.annotations = objectBlocks.map((block, index) => {
    const className = readXmlValue(block, 'name') ?? 'unknown';
    const xmin = Number(readXmlValue(block, 'xmin') ?? 0);
    const ymin = Number(readXmlValue(block, 'ymin') ?? 0);
    const xmax = Number(readXmlValue(block, 'xmax') ?? xmin);
    const ymax = Number(readXmlValue(block, 'ymax') ?? ymin);
    const klass = classes.find((item) => item.name === className) ?? classes[0];
    return makeAnnotation(makeAnnotationName(fileName, index), frame.id, klass.id, { x: xmin, y: ymin, width: xmax - xmin, height: ymax - ymin }, index, 'imported');
  });

  return makeProject('Imported VOC Dataset', classes, [media]);
}

export function exportLabelMe(project: Project): LabelMeFile[] {
  return project.media.flatMap((media) =>
    media.frames.map((frame) => ({
      version: '5.5.0',
      flags: {},
      shapes: frame.annotations.map((annotation) => {
        const klass = project.classes.find((item) => item.id === annotation.classId);
        return {
          label: klass?.name ?? 'unknown',
          points: [
            [annotation.bbox.x, annotation.bbox.y],
            [annotation.bbox.x + annotation.bbox.width, annotation.bbox.y + annotation.bbox.height]
          ],
          group_id: null,
          shape_type: 'rectangle',
          flags: {}
        };
      }),
      imagePath: basename(frame.imagePath),
      imageData: null,
      imageHeight: media.height,
      imageWidth: media.width
    }))
  );
}

export function importLabelMe(file: LabelMeFile): Project {
  const classNames = [...new Set(file.shapes.map((shape) => shape.label))];
  const classes = classNames.map((name, index) => makeClass(name, index));
  const media = makeImageMedia(file.imagePath, file.imageWidth, file.imageHeight);
  const frame = media.frames[0];
  frame.annotations = file.shapes.map((shape, index) => {
    const x1 = Math.min(shape.points[0][0], shape.points[1][0]);
    const y1 = Math.min(shape.points[0][1], shape.points[1][1]);
    const x2 = Math.max(shape.points[0][0], shape.points[1][0]);
    const y2 = Math.max(shape.points[0][1], shape.points[1][1]);
    const klass = classes.find((item) => item.name === shape.label) ?? classes[0];
    return makeAnnotation(makeAnnotationName(file.imagePath, index), frame.id, klass.id, { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }, index, 'imported');
  });

  return makeProject('Imported LabelMe Dataset', classes, [media]);
}

function makeProject(name: string, classes: LabelClass[], media: MediaItem[]): Project {
  const timestamp = nowIso();
  return {
    id: stableId('project', [name, timestamp]),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    classes,
    media,
    settings: {
      pythonPath: 'python',
      modelPath: '',
      ffmpegPath: 'ffmpeg',
      confidenceThreshold: 0.25
    },
    exportHistory: []
  };
}

function makeImageMedia(imagePath: string, width: number, height: number): MediaItem {
  const mediaId = stableId('media', [imagePath]);
  const frameId = stableId('frame', [imagePath, 0]);
  return {
    id: mediaId,
    name: basename(imagePath),
    path: imagePath,
    type: 'image',
    annotationNamePrefix: basenameWithoutExt(imagePath),
    width,
    height,
    frames: [
      {
        id: frameId,
        mediaId,
        index: 0,
        timestampMs: 0,
        imagePath,
        reviewState: 'reviewed',
        annotations: []
      }
    ]
  };
}

function makeClass(name: string, index: number): LabelClass {
  return {
    id: stableId('class', [name]),
    name,
    color: DEFAULT_COLORS[index % DEFAULT_COLORS.length]
  };
}

function makeAnnotation(
  name: string,
  frameId: string,
  classId: string,
  bbox: Bbox,
  index: number,
  source: Annotation['source'],
  confidence?: number
): Annotation {
  return {
    id: stableId('ann', [frameId, classId, index]),
    name,
    frameId,
    classId,
    bbox,
    ...(confidence === undefined ? {} : { confidence }),
    source,
    reviewState: source === 'ai' ? 'unreviewed_ai' : 'reviewed',
    updatedAt: nowIso()
  };
}

function makeAnnotationName(imagePath: string, index: number): string {
  return `${basenameWithoutExt(imagePath)}_000001_${String(index + 1).padStart(2, '0')}`;
}

function basenameWithoutExt(filePath: string): string {
  const name = basename(filePath);
  const dotIndex = name.lastIndexOf('.');
  return dotIndex > 0 ? name.slice(0, dotIndex) : name;
}

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function readXmlValue(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match?.[1]?.trim();
}
