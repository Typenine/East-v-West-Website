'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { NewsletterFrameHandle, OutlineItem } from './types';

function buildNewsletterDocument(html: string): string {
  const stylesheet = '<link rel="stylesheet" href="/newsletter-reader.css" /><link rel="stylesheet" href="/newsletter-reader-mobile.css" />';
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${stylesheet}</head>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />${stylesheet}</head><body>${html}</body></html>`;
}

async function downloadDocumentAsPdf(frameDocument: Document, fileName: string, documentTitle: string): Promise<void> {
  void documentTitle;
  const [{ toPng }, { jsPDF }] = await Promise.all([
    import('html-to-image'),
    import('jspdf'),
  ]);

  const firstElement = frameDocument.body.firstElementChild as HTMLElement | null;
  const root = frameDocument.body.querySelector<HTMLElement>('div[style*="max-width:1080px"]')
    ?? firstElement
    ?? frameDocument.body;
  const nodes = Array.from(root.children).filter((node): node is HTMLElement => node.nodeType === 1) as HTMLElement[];
  const captureNodes = nodes.length > 0 ? nodes : [root];

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 30;
  const marginTop = 28;
  const footerSpace = 28;
  const contentWidth = pageWidth - (marginX * 2);
  const pageBottom = pageHeight - footerSpace;
  let cursorY = marginTop;
  let renderedAnything = false;

  const startNewPage = () => {
    pdf.addPage();
    cursorY = marginTop;
  };

  for (const node of captureNodes) {
    let canvas: HTMLCanvasElement;
    try {
      const imageUrl = await toPng(node, {
        backgroundColor: '#ffffff',
        cacheBust: true,
        pixelRatio: 1.45,
      });
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error('Unable to decode a newsletter PDF image.'));
        nextImage.src = imageUrl;
      });
      canvas = window.document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const imageContext = canvas.getContext('2d');
      if (!imageContext) throw new Error('Unable to prepare a newsletter PDF image.');
      imageContext.drawImage(image, 0, 0);
    } catch (error) {
      console.warn('[Newsletter PDF] Could not render one newsletter block:', error);
      continue;
    }

    if (!canvas.width || !canvas.height) continue;
    const scale = contentWidth / canvas.width;
    const fullHeight = canvas.height * scale;
    const remainingHeight = pageBottom - cursorY;
    if (renderedAnything && fullHeight <= pageBottom - marginTop && fullHeight > remainingHeight) startNewPage();

    let sourceY = 0;
    while (sourceY < canvas.height) {
      let availableHeight = pageBottom - cursorY;
      if (availableHeight < 72) {
        startNewPage();
        availableHeight = pageBottom - cursorY;
      }

      const remainingPixels = canvas.height - sourceY;
      const maxSlicePixels = Math.max(1, Math.floor(availableHeight / scale));
      const slicePixels = Math.min(remainingPixels, maxSlicePixels);
      const sliceCanvas = window.document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = slicePixels;
      const context = sliceCanvas.getContext('2d');
      if (!context) throw new Error('Unable to prepare newsletter PDF canvas.');

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      context.drawImage(canvas, 0, sourceY, canvas.width, slicePixels, 0, 0, canvas.width, slicePixels);

      const renderedHeight = slicePixels * scale;
      pdf.addImage(
        sliceCanvas.toDataURL('image/jpeg', 0.92),
        'JPEG',
        marginX,
        cursorY,
        contentWidth,
        renderedHeight,
        undefined,
        'FAST',
      );
      renderedAnything = true;
      cursorY += renderedHeight + 8;
      sourceY += slicePixels;
      if (sourceY < canvas.height) startNewPage();
    }
  }

  if (!renderedAnything) throw new Error('The newsletter could not be converted to PDF.');

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(210, 218, 230);
    pdf.line(marginX, pageHeight - 23, pageWidth - marginX, pageHeight - 23);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(90, 103, 122);
    pdf.text(`East v. West  |  Page ${page} of ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  pdf.save(fileName);
}

const NewsletterFrame = forwardRef<NewsletterFrameHandle, {
  html: string;
  title: string;
  onOutline: (items: OutlineItem[]) => void;
}>(function NewsletterFrame({ html, title, onOutline }, ref) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const imageCleanupRef = useRef<Array<() => void>>([]);
  const sectionNodesRef = useRef<HTMLElement[]>([]);
  const [height, setHeight] = useState(900);
  const srcDoc = useMemo(() => buildNewsletterDocument(html), [html]);

  const clearObservers = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    imageCleanupRef.current.forEach(cleanup => cleanup());
    imageCleanupRef.current = [];
  }, []);

  const resizeFrame = useCallback(() => {
    const frameDocument = iframeRef.current?.contentDocument;
    if (!frameDocument) return;
    const bodyHeight = frameDocument.body?.scrollHeight ?? 0;
    const documentHeight = frameDocument.documentElement?.scrollHeight ?? 0;
    const nextHeight = Math.max(480, bodyHeight, documentHeight);
    setHeight(current => Math.abs(current - nextHeight) > 1 ? nextHeight : current);
  }, []);

  const handleLoad = useCallback(() => {
    clearObservers();
    const frameDocument = iframeRef.current?.contentDocument;
    if (!frameDocument) return;

    frameDocument.querySelectorAll('.evw-page-number').forEach(node => node.remove());
    const sections = Array.from(frameDocument.querySelectorAll<HTMLElement>('article'));
    sectionNodesRef.current = sections;
    onOutline(sections.map((section, index) => {
      const heading = section.querySelector<HTMLElement>('h2, h3');
      const label = heading?.textContent?.trim() || `Section ${index + 1}`;
      const marker = frameDocument.createElement('div');
      marker.className = 'evw-page-number';
      marker.textContent = `Page ${index + 1} of ${sections.length}`;
      section.appendChild(marker);
      return { index, label };
    }));

    frameDocument.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });

    resizeFrame();
    window.requestAnimationFrame(resizeFrame);
    window.setTimeout(resizeFrame, 150);
    window.setTimeout(resizeFrame, 650);

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(resizeFrame);
      if (frameDocument.documentElement) observer.observe(frameDocument.documentElement);
      if (frameDocument.body) observer.observe(frameDocument.body);
      observerRef.current = observer;
    }

    imageCleanupRef.current = Array.from(frameDocument.images).map(image => {
      const handleImageLoad = () => resizeFrame();
      image.addEventListener('load', handleImageLoad);
      image.addEventListener('error', handleImageLoad);
      return () => {
        image.removeEventListener('load', handleImageLoad);
        image.removeEventListener('error', handleImageLoad);
      };
    });
    void frameDocument.fonts?.ready.then(resizeFrame).catch(() => {});
  }, [clearObservers, onOutline, resizeFrame]);

  useImperativeHandle(ref, () => ({
    async downloadPdf(fileName: string, documentTitle: string) {
      const frameDocument = iframeRef.current?.contentDocument;
      if (!frameDocument) throw new Error('Newsletter is not ready for PDF export.');
      await downloadDocumentAsPdf(frameDocument, fileName, documentTitle);
    },
    scrollToSection(index: number) {
      const iframe = iframeRef.current;
      const target = sectionNodesRef.current[index];
      if (!iframe || !target) return;
      const frameTop = iframe.getBoundingClientRect().top + window.scrollY;
      const targetTop = target.getBoundingClientRect().top;
      window.scrollTo({ top: Math.max(0, frameTop + targetTop - 92), behavior: 'smooth' });
    },
  }), []);

  useEffect(() => setHeight(900), [srcDoc]);
  useEffect(() => {
    window.addEventListener('resize', resizeFrame);
    return () => window.removeEventListener('resize', resizeFrame);
  }, [resizeFrame]);
  useEffect(() => clearObservers, [clearObservers]);

  return (
    <iframe
      ref={iframeRef}
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onLoad={handleLoad}
      className="block w-full border-0 bg-transparent"
      style={{ height: `${height}px` }}
    />
  );
});

export default NewsletterFrame;
