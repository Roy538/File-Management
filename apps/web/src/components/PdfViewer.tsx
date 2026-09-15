import { pdfjs, Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface Props {
  url: string;
  pageNumber: number;
  scale: number;
  onNumPages: (n: number) => void;
  onPageLoaded?: (width: number, height: number) => void;
}

export function PdfViewer({ url, pageNumber, scale, onNumPages, onPageLoaded }: Props) {
  return (
    <Document
      file={url}
      onLoadSuccess={({ numPages }) => onNumPages(numPages)}
      loading={
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
          Loading PDF…
        </div>
      }
      error={
        <div className="flex items-center justify-center h-64 text-red-500 text-sm">
          Failed to load PDF. Ensure the file is accessible and CORS is enabled on storage.
        </div>
      }
    >
      <Page
        pageNumber={pageNumber}
        scale={scale}
        onLoadSuccess={p => onPageLoaded?.(p.width, p.height)}
      />
    </Document>
  );
}
