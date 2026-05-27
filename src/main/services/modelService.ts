import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';

export type AdvancedModelName = 'yolov8s' | 'yolov8m';
type Downloader = (url: string, outputPath: string) => Promise<void>;

const MODEL_BASE_URL = 'https://github.com/ultralytics/assets/releases/download/v8.3.0';

export function bundledModelPath(resourceRoot: string): string {
  return path.join(resourceRoot, 'models', 'yolov8n.pt');
}

export function modelFileName(modelPath: string): string {
  return modelPath ? path.basename(modelPath) : 'No model selected';
}

export async function downloadAdvancedModel(
  model: AdvancedModelName,
  userDataPath: string,
  downloader: Downloader = downloadFile
): Promise<string> {
  const outputPath = path.join(userDataPath, 'models', `${model}.pt`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await downloader(`${MODEL_BASE_URL}/${model}.pt`, outputPath);
  return outputPath;
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = https.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, outputPath).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        return;
      }
      const output = createWriteStream(outputPath);
      response.pipe(output);
      output.on('finish', () => output.close(() => resolve()));
      output.on('error', reject);
    });
    request.on('error', reject);
  });
}
