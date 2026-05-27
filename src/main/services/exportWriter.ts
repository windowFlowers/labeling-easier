import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exportCoco, exportLabelMe, exportVoc, exportYolo } from '../../shared/converters';
import type { ExportWriteResult, LabelFormat, LabelMeFile, Project } from '../../shared/types';

export async function writeExportFiles(project: Project, format: LabelFormat, outputDirectory: string): Promise<ExportWriteResult> {
  await mkdir(outputDirectory, { recursive: true });

  if (format === 'coco') {
    await writeFile(path.join(outputDirectory, 'coco.json'), `${JSON.stringify(exportCoco(project), null, 2)}\n`, 'utf8');
    return { saved: true, outputPath: outputDirectory, fileCount: 1, format };
  }

  if (format === 'labelme') {
    const files = exportLabelMe(project);
    await Promise.all(
      files.map((file, index) =>
        writeFile(path.join(outputDirectory, labelMeFileName(file, index)), `${JSON.stringify(file, null, 2)}\n`, 'utf8')
      )
    );
    return { saved: true, outputPath: outputDirectory, fileCount: files.length, format };
  }

  const files = format === 'yolo' ? exportYolo(project) : exportVoc(project);
  await Promise.all(
    files.map((file) => writeFile(path.join(outputDirectory, path.basename(file.path)), file.content, 'utf8'))
  );
  return { saved: true, outputPath: outputDirectory, fileCount: files.length, format };
}

function labelMeFileName(file: LabelMeFile, index: number): string {
  const baseName = path.basename(file.imagePath);
  const dotIndex = baseName.lastIndexOf('.');
  const stem = dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName || `frame-${index + 1}`;
  return `${stem}.json`;
}
