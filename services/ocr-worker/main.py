import base64
import io
import logging

import pytesseract
from fastapi import BackgroundTasks, FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel

try:
    import fitz  # PyMuPDF
    HAS_PYMUPDF = True
except ImportError:
    try:
        from pdf2image import convert_from_bytes
        HAS_PDF2IMAGE = True
    except ImportError:
        HAS_PDF2IMAGE = False
    HAS_PYMUPDF = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="FTS OCR Worker", version="0.2.0")


# ── Synchronous endpoint (used by NestJS BullMQ processor) ───────────────────

class OcrRequest(BaseModel):
    data: str      # base64-encoded file bytes
    mimeType: str


class OcrResponse(BaseModel):
    text: str
    pages: int = 1


@app.post("/ocr", response_model=OcrResponse)
async def ocr_sync(body: OcrRequest) -> OcrResponse:
    """Accepts base64-encoded file, returns extracted text synchronously."""
    try:
        content = base64.b64decode(body.data)
        mime = body.mimeType.lower()

        if mime == "application/pdf":
            if HAS_PYMUPDF:
                doc = fitz.open(stream=content, filetype="pdf")
                pages_text = []
                for page in doc:
                    text = page.get_text()
                    if not text.strip():
                        pix = page.get_pixmap(dpi=150)
                        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                        text = pytesseract.image_to_string(img)
                    pages_text.append(text)
                return OcrResponse(text="\n\n".join(pages_text).strip(), pages=len(doc))
            elif HAS_PDF2IMAGE:
                pages = convert_from_bytes(content, dpi=200)
                texts = [pytesseract.image_to_string(p) for p in pages]
                return OcrResponse(text="\n".join(texts).strip(), pages=len(pages))
            else:
                raise HTTPException(status_code=422, detail="No PDF library available")

        elif mime.startswith("image/"):
            img = Image.open(io.BytesIO(content))
            text = pytesseract.image_to_string(img)
            return OcrResponse(text=text.strip())

        else:
            return OcrResponse(text="")

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("OCR failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Async / push-back endpoint (legacy, for direct S3 worker) ────────────────

class AsyncOcrRequest(BaseModel):
    storage_key: str
    document_version_id: str
    document_id: str


@app.post("/ocr/extract")
async def extract_text(request: AsyncOcrRequest, background_tasks: BackgroundTasks):
    """Enqueue OCR processing as a background task and return immediately."""
    background_tasks.add_task(_process_async, request)
    return {"status": "queued", "document_version_id": request.document_version_id}


async def _process_async(request: AsyncOcrRequest):
    from worker import run_ocr
    try:
        await run_ocr(request.storage_key, request.document_id, request.document_version_id)
    except Exception as exc:
        logger.error("Async OCR failed for %s: %s", request.document_version_id, exc, exc_info=True)


@app.get("/health")
def health():
    return {"status": "ok", "pymupdf": HAS_PYMUPDF}
