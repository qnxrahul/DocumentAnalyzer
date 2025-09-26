import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TextExtractionService {
  async extractPdfText(arrayBuffer: ArrayBuffer): Promise<string> {
    const pdfjsLib = await import('pdfjs-dist');
    // @ts-ignore worker entry hint for bundler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let extracted = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = (content.items as any[]).map((item: any) => item.str).join(' ');
      extracted += (text ? text : '') + '\n';
    }
    const plain = extracted.trim();
    if (plain.length > 50) return extracted;

    // OCR fallback for image-based PDFs
    try {
      // Prefer ESM build for bundlers; use runtime resolution to avoid pre-bundle issues
      let createWorker: any;
      try {
        const mod: any = await import(/* @vite-ignore */ 'tesseract.js/dist/tesseract.esm.min.js');
        createWorker = mod.createWorker;
      } catch {
        const mod: any = await import(/* @vite-ignore */ 'tesseract.js');
        createWorker = mod.createWorker;
      }
      // Render each page to canvas and OCR
      let ocrText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx as any, viewport, canvas }).promise;
        const worker = await createWorker('eng');
        const { data } = await worker.recognize(canvas);
        ocrText += (data?.text || '') + '\n';
        await worker.terminate();
      }
      return ocrText;
    } catch {
      return extracted;
    }
  }
}

