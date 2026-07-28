export interface DocumentoPagina {
  numeroPagina: number;
  textoLimpo: string;
  imagens?: any[];
  posicaoTexto?: any;
  metadados?: any;
}

/**
 * Dynamically load PDF.js from CDN to avoid bundle size issues and handle iframe/sandbox environments cleanly
 */
export const loadPdfJS = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib);
      return;
    }

    // Check if the script is already appended
    let script = document.getElementById('pdfjs-script') as HTMLScriptElement;
    if (script) {
      script.addEventListener('load', () => {
        const pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(pdfjsLib);
      });
      script.addEventListener('error', (err) => reject(err));
      return;
    }

    script = document.createElement('script');
    script.id = 'pdfjs-script';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(pdfjsLib);
    };
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
};

/**
 * Extracts raw, clean text from a PDF file page-by-page, preserving physical line coordinates
 */
export const extractTextFromPdfFile = async (
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<DocumentoPagina[]> => {
  const pdfjsLib = await loadPdfJS();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const pages: DocumentoPagina[] = [];

  for (let i = 1; i <= numPages; i++) {
    if (onProgress) onProgress(i, numPages);
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];

    // Reconstruct lines by sorting physically top-to-bottom, then left-to-right
    // transform matrix: [scaleX, skewY, skewX, scaleY, translateX, translateY]
    // transform[5] = Y coordinate, transform[4] = X coordinate.
    items.sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > 5) {
        return yDiff; // top-to-bottom
      }
      return a.transform[4] - b.transform[4]; // left-to-right
    });

    let lastY: number | undefined;
    let text = "";
    for (const item of items) {
      if (lastY !== undefined && Math.abs(item.transform[5] - lastY) > 5) {
        text += "\n";
      }
      text += item.str + " ";
      lastY = item.transform[5];
    }

    pages.push({
      numeroPagina: i,
      textoLimpo: text.trim(),
      imagens: [],
      posicaoTexto: {},
      metadados: {
        width: page.view[2],
        height: page.view[3]
      }
    });
  }

  return pages;
};

/**
 * Standard utility to split plain text mock files or other non-PDF files into page-like chunks
 */
export const convertTextToPaginas = (text: string): DocumentoPagina[] => {
  const pages: DocumentoPagina[] = [];
  
  // Check if standard form-feed \f is present
  if (text.includes("\f")) {
    const parts = text.split("\f");
    parts.forEach((part, i) => {
      pages.push({
        numeroPagina: i + 1,
        textoLimpo: part.trim(),
        imagens: [],
        posicaoTexto: {}
      });
    });
  } else if (text.toUpperCase().includes("CELESC") && text.match(/(?:UC:|Unidade\s+Consumidora|PONTO\s*\d+|PONTO)/gi)) {
    // If it's a large consolidated report, we can simulate pages by grouping points
    const lines = text.split("\n");
    let currentPageText = "";
    let pageNum = 1;
    let ucsOnPage = 0;

    for (const line of lines) {
      if (line.match(/(?:PONTO\s*\d+|UC:|Unidade\s+Consumidora)/i)) {
        ucsOnPage++;
        // If we already have 5 UCs on a single page, let's split it for readability / page limits
        if (ucsOnPage > 5) {
          pages.push({
            numeroPagina: pageNum++,
            textoLimpo: currentPageText.trim(),
            imagens: [],
            posicaoTexto: {}
          });
          currentPageText = "";
          ucsOnPage = 1;
        }
      }
      currentPageText += line + "\n";
    }

    if (currentPageText.trim()) {
      pages.push({
        numeroPagina: pageNum,
        textoLimpo: currentPageText.trim(),
        imagens: [],
        posicaoTexto: {}
      });
    }
  } else if (text.toUpperCase().includes("CASAN") && text.match(/(?:Matrícula|Matricula|UC\s+DEBITO:)/gi)) {
    // Similarly for CASAN report
    const lines = text.split("\n");
    let currentPageText = "";
    let pageNum = 1;
    let ucsOnPage = 0;

    for (const line of lines) {
      if (line.match(/(?:Matrícula|Matricula|UC\s+DEBITO:)/i)) {
        ucsOnPage++;
        if (ucsOnPage > 5) {
          pages.push({
            numeroPagina: pageNum++,
            textoLimpo: currentPageText.trim(),
            imagens: [],
            posicaoTexto: {}
          });
          currentPageText = "";
          ucsOnPage = 1;
        }
      }
      currentPageText += line + "\n";
    }

    if (currentPageText.trim()) {
      pages.push({
        numeroPagina: pageNum,
        textoLimpo: currentPageText.trim(),
        imagens: [],
        posicaoTexto: {}
      });
    }
  } else {
    // Default fallback: Single page
    pages.push({
      numeroPagina: 1,
      textoLimpo: text.trim(),
      imagens: [],
      posicaoTexto: {}
    });
  }
  
  return pages;
};
