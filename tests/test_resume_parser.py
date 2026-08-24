"""
test_resume_parser.py - Unit tests for the resume parser service.

Verifies handling of empty, malformed, unsupported, and valid resume file types.
Uses standard Python unittest framework (fully compatible with pytest).
"""

import unittest
from server.services.resume_parser import (
    extract_resume_text,
    validate_file_metadata,
    compute_file_hash,
    ResumeParseError
)


class TestResumeParser(unittest.TestCase):
    """Test suite for resume parsing robustness and error isolation."""

    def test_empty_file_raises_error(self):
        """Test that an empty byte array (0 bytes) raises a ResumeParseError."""
        empty_bytes = b""
        with self.assertRaises(ResumeParseError) as ctx:
            extract_resume_text(empty_bytes, "candidate_resume.pdf")
        self.assertIn("empty", str(ctx.exception).lower())

    def test_malformed_pdf_raises_error(self):
        """Test that corrupted/garbage PDF binary data raises a ResumeParseError."""
        garbage_bytes = b"%PDF-1.4 ... corrupted garbage stream binary that is not a valid PDF header ..."
        with self.assertRaises(ResumeParseError) as ctx:
            extract_resume_text(garbage_bytes, "corrupted_resume.pdf")
        self.assertTrue(
            "corrupted" in str(ctx.exception).lower() or 
            "unreadable" in str(ctx.exception).lower() or
            "failed" in str(ctx.exception).lower() or
            "pdf" in str(ctx.exception).lower()
        )

    def test_unsupported_file_extension(self):
        """Test that attempting to upload an unsupported extension (e.g. .exe, .png) is rejected."""
        dummy_bytes = b"Some fake text data"
        with self.assertRaises(ResumeParseError) as ctx:
            validate_file_metadata("malicious_file.exe", len(dummy_bytes))
        self.assertIn("unsupported", str(ctx.exception).lower())

    def test_missing_extension(self):
        """Test that filenames with missing extensions raise an error."""
        with self.assertRaises(ResumeParseError):
            validate_file_metadata("resume_with_no_ext", 500)

    def test_valid_text_extraction(self):
        """Test extracting text from a valid UTF-8 text file."""
        sample_resume = (
            "Jane Doe\n"
            "Senior Backend Engineer with 5 years experience in Python, Flask, and PostgreSQL.\n"
            "Education: B.S. in Computer Science."
        )
        content_bytes = sample_resume.encode("utf-8")
        result = extract_resume_text(content_bytes, "jane_doe_resume.txt")
        self.assertIn("Jane Doe", result)
        self.assertIn("Python, Flask", result)

    def test_file_hash_computation(self):
        """Test that identical file contents produce consistent SHA-256 hashes for deduplication."""
        data_a = b"Resume content version 1"
        data_b = b"Resume content version 1"
        data_c = b"Different resume content"
        hash_a = compute_file_hash(data_a)
        hash_b = compute_file_hash(data_b)
        hash_c = compute_file_hash(data_c)
        self.assertEqual(hash_a, hash_b)
        self.assertNotEqual(hash_a, hash_c)


if __name__ == "__main__":
    unittest.main()
