import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface AiWorkerArgsInput {
  workerScriptPath: string;
  modelPath: string;
  confidenceThreshold: number;
  device: 'auto' | 'cpu' | 'cuda';
}

export type AiWorkerEvent =
  | { type: 'ready'; device: string }
  | { type: 'progress'; completed: number; total: number }
  | { type: 'result'; frameId: string; detections: AiDetection[] }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface AiDetection {
  className: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface RunAiInput {
  frames: Array<{
    frameId: string;
    imagePath: string;
  }>;
}

export function buildAiWorkerArgs(input: AiWorkerArgsInput): string[] {
  return [
    input.workerScriptPath,
    '--model',
    input.modelPath,
    '--confidence',
    String(input.confidenceThreshold),
    '--device',
    input.device
  ];
}

export function parseWorkerLine(line: string): AiWorkerEvent {
  try {
    return JSON.parse(line) as AiWorkerEvent;
  } catch {
    return { type: 'error', message: `Malformed worker output: ${line}` };
  }
}

export class AiWorkerSession {
  private child?: ChildProcessWithoutNullStreams;

  start(pythonPath: string, args: string[], onEvent: (event: AiWorkerEvent) => void): void {
    this.cancel();
    this.child = spawn(pythonPath, args, { stdio: 'pipe' });
    const stdout = createInterface({ input: this.child.stdout });
    stdout.on('line', (line) => onEvent(parseWorkerLine(line)));
    this.child.stderr.on('data', (chunk) => {
      onEvent({ type: 'error', message: String(chunk).trim() });
    });
    this.child.on('error', (error) => {
      onEvent({ type: 'error', message: error.message });
    });
  }

  run(input: RunAiInput): void {
    if (!this.child) {
      throw new Error('AI worker is not running.');
    }
    this.child.stdin.write(`${JSON.stringify({ type: 'detect', ...input })}\n`);
  }

  cancel(): void {
    if (this.child && !this.child.killed) {
      this.child.kill();
    }
    this.child = undefined;
  }
}
