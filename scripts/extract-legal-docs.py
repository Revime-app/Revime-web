#!/usr/bin/env python3
"""
CLI entry point for legal documents extraction.
Usage:
    python scripts/extract-legal-docs.py [--dry-run]
"""

import os
import sys

# Ensure this directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from extract_legal_docs import main

if __name__ == "__main__":
    main()
