"""
resume_parser.py - Service for extracting raw text from candidate resume files.

Supports PDF (PyPDF2), DOCX (docx2txt), and plain text files with robust error
handling and input validation.
"""

import io
import os
import hashlib
from typing import Optional, Union, BinaryIO

try:
    import PyPDF2
except ImportError:
    PyPDF2 = None

try:
    import docx2txt
except ImportError:
    docx2txt = None


class ResumeParseError(Exception):
    """Custom exception raised when resume parsing fails or file is invalid."""
    pass


ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.doc', '.txt'}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB limit


def compute_file_hash(content: bytes) -> str:
    """
    Compute SHA-256 hash of file content to detect duplicates and prevent re-parsing.

    Args:
        content: Raw bytes of the file.

    Returns:
        Hexadecimal SHA-256 hash string.
    """
    return hashlib.sha256(content).hexdigest()


def validate_file_metadata(filename: str, file_size: Optional[int] = None) -> str:
    """
    Validate the file extension and optional size constraint.

    Args:
        filename: Name of the uploaded file.
        file_size: Optional size in bytes.

    Returns:
        Normalized file extension (e.g. '.pdf').

    Raises:
        ResumeParseError: If the extension is unsupported or size exceeds limit.
    """
    if not filename or '.' not in filename:
        raise ResumeParseError(f"Invalid filename '{filename}': Missing extension.")

    _, ext = os.path.splitext(filename)
    ext = ext.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise ResumeParseError(
            f"Unsupported file format '{ext}'. Allowed formats: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    if file_size is not None and file_size > MAX_FILE_SIZE_BYTES:
        raise ResumeParseError(
            f"File size ({file_size / (1024*1024):.2f} MB) exceeds the 10MB maximum limit."
        )

    return ext


def parse_pdf(file_stream: Union[BinaryIO, bytes]) -> str:
    """
    Extract text content from a PDF file stream using PyPDF2.

    Args:
        file_stream: Bytes or binary stream of the PDF file.

    Returns:
        Extracted and sanitized text content.

    Raises:
        ResumeParseError: If the PDF is corrupted, password-protected, or empty.
    """
    if isinstance(file_stream, bytes):
        file_stream = io.BytesIO(file_stream)

    try:
        reader = PyPDF2.PdfReader(file_stream)
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                raise ResumeParseError("PDF file is password-protected and cannot be parsed.")

        if len(reader.pages) == 0:
            raise ResumeParseError("PDF file contains no readable pages.")

        extracted_text = []
        for index, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                extracted_text.append(page_text.strip())

        full_text = "\n\n".join(extracted_text).strip()
        if not full_text:
            raise ResumeParseError("PDF was parsed successfully, but no extractable text was found (it may be scanned/image-only).")

        return full_text

    except ResumeParseError:
        raise
    except Exception as e:
        raise ResumeParseError(f"Corrupted or unreadable PDF document: {str(e)}") from e


def parse_docx(file_stream: Union[BinaryIO, bytes], temp_filepath: Optional[str] = None) -> str:
    """
    Extract text content from a DOCX file stream using docx2txt.

    Args:
        file_stream: Bytes or binary stream of the DOCX file.
        temp_filepath: Optional temporary file path if available.

    Returns:
        Extracted text content.

    Raises:
        ResumeParseError: If the DOCX is corrupted or empty.
    """
    import tempfile

    temp_created = False
    if temp_filepath is None:
        if isinstance(file_stream, bytes):
            data = file_stream
        else:
            data = file_stream.read()

        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as temp_f:
            temp_f.write(data)
            temp_filepath = temp_f.name
            temp_created = True

    try:
        text = docx2txt.process(temp_filepath)
        if not text or not text.strip():
            raise ResumeParseError("DOCX file was parsed successfully, but contained no extractable text.")
        return text.strip()
    except ResumeParseError:
        raise
    except Exception as e:
        raise ResumeParseError(f"Corrupted or unreadable DOCX document: {str(e)}") from e
    finally:
        if temp_created and temp_filepath and os.path.exists(temp_filepath):
            try:
                os.unlink(temp_filepath)
            except Exception:
                pass


def parse_txt(file_stream: Union[BinaryIO, bytes]) -> str:
    """
    Extract text from a plain text file.

    Args:
        file_stream: Bytes or stream of the TXT file.

    Returns:
        Decoded text string.

    Raises:
        ResumeParseError: If file is empty or encoding is unrecognized.
    """
    if hasattr(file_stream, 'read'):
        raw_bytes = file_stream.read()
    else:
        raw_bytes = file_stream

    if not raw_bytes or len(raw_bytes.strip()) == 0:
        raise ResumeParseError("Text file is empty.")

    encodings = ['utf-8', 'latin-1', 'cp1252', 'utf-16']
    for enc in encodings:
        try:
            decoded = raw_bytes.decode(enc).strip()
            if decoded:
                return decoded
        except (UnicodeDecodeError, AttributeError):
            continue

    raise ResumeParseError("Unable to decode text file with standard encodings.")


def extract_resume_text(file_content: bytes, filename: str) -> str:
    """
    Primary dispatcher function to validate and extract raw text from any supported resume file.

    Args:
        file_content: Raw byte content of the resume.
        filename: Original file name.

    Returns:
        Extracted, trimmed text string.

    Raises:
        ResumeParseError: If validation or extraction fails.
    """
    if not file_content or len(file_content) == 0:
        raise ResumeParseError(f"File '{filename}' is empty (0 bytes).")

    ext = validate_file_metadata(filename, len(file_content))

    if ext == '.pdf':
        return parse_pdf(file_content)
    elif ext in ('.docx', '.doc'):
        return parse_docx(file_content)
    elif ext == '.txt':
        return parse_txt(file_content)
    else:
        raise ResumeParseError(f"Unsupported file format '{ext}'.")
