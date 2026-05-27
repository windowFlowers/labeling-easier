import { describe, expect, it } from 'vitest';
import { buildAiWorkerArgs, parseWorkerLine } from '../../src/main/services/aiWorker';

describe('AI worker helpers', () => {
  it('builds explicit YOLO worker args for external dependencies', () => {
    expect(
      buildAiWorkerArgs({
        workerScriptPath: 'C:/app/ai_worker.py',
        modelPath: 'C:/models/yolo.pt',
        confidenceThreshold: 0.4,
        device: 'auto'
      })
    ).toEqual(['C:/app/ai_worker.py', '--model', 'C:/models/yolo.pt', '--confidence', '0.4', '--device', 'auto']);
  });

  it('parses JSONL worker events and reports malformed lines', () => {
    expect(parseWorkerLine('{"type":"ready","device":"cuda"}')).toEqual({ type: 'ready', device: 'cuda' });
    expect(parseWorkerLine('not-json')).toEqual({ type: 'error', message: 'Malformed worker output: not-json' });
  });
});
