import type { LabelingEasierApi } from '../preload/preload';

declare global {
  interface Window {
    labelingEasier?: LabelingEasierApi;
  }
}
