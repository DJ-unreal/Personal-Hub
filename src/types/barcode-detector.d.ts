/* Minimal typings for the Barcode Detection API, which ships natively in
   Chrome/Edge but isn't in TypeScript's DOM lib yet.
   https://developer.mozilla.org/docs/Web/API/BarcodeDetector */

interface DetectedBarcode {
  rawValue: string;
  format: string;
  boundingBox: DOMRectReadOnly;
}

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  static getSupportedFormats(): Promise<string[]>;
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
