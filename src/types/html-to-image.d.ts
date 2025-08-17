declare module 'html-to-image' {
  export interface Options {
    backgroundColor?: string;
    width?: number;
    height?: number;
    style?: Partial<CSSStyleDeclaration>;
    filter?: (domNode: HTMLElement) => boolean;
    quality?: number;
    canvasWidth?: number;
    canvasHeight?: number;
    pixelRatio?: number;
    skipFonts?: boolean;
  }

  export function toPng(node: HTMLElement, options?: Options): Promise<string>;
  export function toJpeg(node: HTMLElement, options?: Options): Promise<string>;
  export function toSvg(node: HTMLElement, options?: Options): Promise<string>;
  export function toBlob(node: HTMLElement, options?: Options): Promise<Blob>;
  export function toPixelData(node: HTMLElement, options?: Options): Promise<Uint8ClampedArray>;
}
