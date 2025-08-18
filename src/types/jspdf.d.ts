declare module 'jspdf' {
  export class jsPDF {
    constructor(options?: unknown);
    addImage(imageData: unknown, format: string, x: number, y: number, width?: number, height?: number): this;
    save(filename?: string): void;
  }
}
