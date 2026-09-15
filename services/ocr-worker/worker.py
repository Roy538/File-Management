import os
import io
import logging
import httpx
import boto3
import pytesseract
from PIL import Image

logger = logging.getLogger(__name__)

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "fts-documents")
API_INTERNAL_URL = os.getenv("API_INTERNAL_URL", "http://api:3000/api/internal")


def _s3_client():
    return boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        region_name="us-east-1",
    )


async def run_ocr(storage_key: str, document_id: str, document_version_id: str):
    s3 = _s3_client()
    obj = s3.get_object(Bucket=MINIO_BUCKET, Key=storage_key)
    file_bytes = obj["Body"].read()
    content_type: str = obj.get("ContentType", "")

    extracted_text = ""
    is_pdf = "pdf" in content_type.lower() or storage_key.lower().endswith(".pdf")

    if is_pdf:
        from pdf2image import convert_from_bytes

        pages = convert_from_bytes(file_bytes, dpi=200)
        for page in pages:
            extracted_text += pytesseract.image_to_string(page) + "\n"
    else:
        image = Image.open(io.BytesIO(file_bytes))
        extracted_text = pytesseract.image_to_string(image)

    extracted_text = extracted_text.strip()
    logger.info(f"OCR complete for document {document_id}: {len(extracted_text)} chars")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{API_INTERNAL_URL}/ocr/result",
            json={
                "documentId": document_id,
                "documentVersionId": document_version_id,
                "text": extracted_text,
            },
        )
        response.raise_for_status()
