import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { bundledModelPath, downloadAdvancedModel, modelFileName } from '../../src/main/services/modelService';

describe('model service', () => {
  it('resolves the bundled YOLOv8n model path from resources', () => {
    expect(bundledModelPath('C:/Program Files/Labeling Easier/resources')).toBe(
      path.join('C:/Program Files/Labeling Easier/resources', 'models', 'yolov8n.pt')
    );
  });

  it('formats displayed model file names', () => {
    expect(modelFileName('C:/models/custom.pt')).toBe('custom.pt');
    expect(modelFileName('')).toBe('No model selected');
  });

  it('downloads advanced models to user data without changing selection implicitly', async () => {
    const downloader = vi.fn().mockResolvedValue(undefined);

    const output = await downloadAdvancedModel('yolov8m', 'C:/UserData', downloader);

    expect(output).toBe(path.join('C:/UserData', 'models', 'yolov8m.pt'));
    expect(downloader).toHaveBeenCalledWith(
      'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8m.pt',
      path.join('C:/UserData', 'models', 'yolov8m.pt')
    );
  });
});
