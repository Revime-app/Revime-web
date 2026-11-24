"""
Legal Document Extractor Pipeline for RépareMe (REVIME).

Extracts and parses official source legal PDFs (10 October 2026) from
assets/originals/legal/ and produces structured TypeScript files conforming
to the LegalDocument / LegalSection interface under apps/mobile/src/lib/legal/.

Conventions:
- All bullet points normalized to '• ' (\u2022).
- Addresses preserve explicit '\\n' line breaks.
- The client's text is never edited: the generator may join the lines of a wrapped sentence
  and may drop extraction artefacts (see `repair_extraction_artifacts`), but it never adds,
  removes or rewrites a word or a punctuation mark. A PDF that does not look as expected makes
  the run fail instead of being quietly corrected.
- Sections categorized into Level 1 (primary articles) and Level 2 (subsections).
"""

from __future__ import annotations

import os
import re
import sys
from typing import Any

try:
    import pypdf
except ImportError:
    pypdf = None


# Unicode bullet symbols to normalize
BULLET_CHARS_PATTERN = re.compile(r"[\uf0b7\u2022\u25cf\u25aa\u25b8\u2023\u2043]")

# Heading detection patterns
LEVEL_1_HEADING_REGEX = re.compile(
    r"^(?:(?:\d+(?:\s+bis|\s+ter)?\s*[\.–—\-:]|\d+\s+[–—\-])\s+[A-ZÀ-ÿ0-9\s\',’–—\(\)\.\?\-:]+|ARTICLE\s+\d+[^\n]*)$"
)
LEVEL_2_HEADING_REGEX = re.compile(
    r"^\d+\.\d+(?:\.\d+)?\s+[A-Za-zÀ-ÿ0-9\s\',’–—\(\)\.\?\-:]+$"
)

PREPOSITIONS = {
    "aux", "au", "à", "de", "du", "des", "d'", "le", "la", "les", "l'",
    "en", "dans", "sur", "sous", "par", "pour", "avec", "sans", "ou", "et",
    "un", "une", "ce", "cet", "cette", "ces", "son", "sa", "ses", "leur", "leurs",
    "que", "qu'", "qui", "dont", "où", "comme", "si", "ni",
}


# pypdf reports a space wherever the PDF positions two glyph runs a little apart, although the
# client's text has none (checked against the PDF's own text layer with `pdftotext`):
# '7 ,40 €' is '7,40 €' and 'D’ AFFICHAGE' is 'D’AFFICHAGE'.
DIGIT_COMMA_GAP = re.compile(r"(?<=\d) ,(?=\d)")
ELISION_GAP = re.compile(r"(?<=\b[DdLlJjNnSsCcMmTtQq][’']) (?=[A-Za-zÀ-ÿ])")


def repair_extraction_artifacts(text: str) -> str:
    """Removes the spaces pypdf invents inside a number or after an elision apostrophe."""
    return ELISION_GAP.sub("", DIGIT_COMMA_GAP.sub(",", text))


# 'conformément aux articles' + 'L611-1 et suivants': the reference number starts the next line.
ARTICLE_REFERENCE_END = re.compile(r"\b(?:articles?|art\.)\s*$", re.IGNORECASE)


def join_wrapped(prev: str, nxt: str) -> str:
    """
    Joins two physical lines of one sentence. A line that ends in a hyphen glued to a word
    continues that word ('L221-' + '25' is 'L221-25', 'celui-' + 'ci' is 'celui-ci'), so no
    space is added there.
    """
    if re.search(r"[0-9A-Za-zÀ-ÿ]-$", prev) and re.match(r"[0-9a-zà-ÿ]", nxt):
        return prev + nxt
    return prev + " " + nxt


def ends_with_preposition(text: str) -> bool:
    words = text.rstrip().split()
    if not words:
        return False
    last_w = words[-1].lower().rstrip(",;:")
    return last_w in PREPOSITIONS or text.rstrip().endswith(("(", "«", "-", "—"))


HEADING_WRAP_ENDINGS = (
    " DE LA", " DE", " DU", " DES", " D'", " D’", " ET", " OU", " SUR", " POUR", " AU", " AUX",
)


def heading_ends_with_prep(heading: str) -> bool:
    h_upper = heading.upper().rstrip()
    return any(h_upper.endswith(w) for w in HEADING_WRAP_ENDINGS)


# Known document mapping from source PDF basename to target ts filename & constant
DOC_DEFINITIONS: list[dict[str, Any]] = [
    {
        "pdf": "CGU T.pdf",
        "keywords": ["cgu"],
        "file": "cgu.ts",
        "const": "CGU",
        "title": "CONDITIONS GÉNÉRALES D’UTILISATION — REVIME",
    },
    {
        "pdf": "POLITIQUE DE CONFIDENTIALITÉ T.pdf",
        "keywords": ["confidentialit"],
        "file": "confidentialite.ts",
        "const": "POLITIQUE_DE_CONFIDENTIALITE",
        "title": "POLITIQUE DE CONFIDENTIALITÉ — REVIME",
    },
    {
        "pdf": "MENTIONS LÉGALES AC.pdf",
        "keywords": ["mentions"],
        "file": "mentions-legales.ts",
        "const": "MENTIONS_LEGALES",
        "title": "MENTIONS LÉGALES — REVIME",
    },
    {
        "pdf": "FONCTIONNEMENT DE REVIME T.pdf",
        "keywords": ["fonctionnement"],
        "file": "fonctionnement.ts",
        "const": "FONCTIONNEMENT",
        "title": "FONCTIONNEMENT DE REVIME",
    },
    {
        "pdf": "INFORMATIONS RELATIVES AU PAIEMENT T.pdf",
        "keywords": ["paiement"],
        "file": "paiement-info.ts",
        "const": "PAIEMENT_INFO",
        "title": "INFORMATIONS RELATIVES AU PAIEMENT — REVIME",
    },
    {
        "pdf": "PROTECTION REVIME T.pdf",
        "keywords": ["protection"],
        "file": "protection.ts",
        "const": "PROTECTION_REVIME",
        "title": "PROTECTION REVIME",
    },
    {
        "pdf": "LIVRAISON T.pdf",
        "keywords": ["livraison"],
        "file": "livraison.ts",
        "const": "LIVRAISON",
        "title": "LIVRAISON — REVIME",
    },
    {
        "pdf": "RÈGLES DE LA PLATEFORME T.pdf",
        "keywords": ["plateforme"],
        "file": "regles.ts",
        "const": "REGLES_PLATEFORME",
        "title": "RÈGLES DE LA PLATEFORME — REVIME",
    },
    {
        "pdf": "POLITIQUE DES AVIS T.pdf",
        "keywords": ["avis"],
        "file": "avis.ts",
        "const": "POLITIQUE_DES_AVIS",
        "title": "POLITIQUE DES AVIS — REVIME",
    },
    {
        "pdf": "COMMENT SONT CLASSÉS LES RÉPARATEURS SUR REVIME T.pdf",
        "keywords": ["comment", "revime"],
        "file": "classement.ts",
        "const": "CLASSEMENT",
        "title": "COMMENT SONT CLASSÉS LES RÉPARATEURS SUR REVIME ?",
    },
    {
        "pdf": "CLASSEMENT DES RÉPARATEURS T.pdf",
        "keywords": ["classement des"],
        "file": "classement-resume.ts",
        "const": "CLASSEMENT_RESUME",
        "title": "CLASSEMENT DES RÉPARATEURS",
    },
]


def normalize_bullets(text: str) -> str:
    """Normalizes bullet characters (\uf0b7, , \u2022, etc.) to '• ' with a single trailing space."""
    # Replace any bullet symbol at line start
    res = re.sub(r"(?m)^[ \t]*[\uf0b7\u2022\u25cf\u25aa\u25b8\u2023\u2043][ \t]*", "• ", text)
    # Also replace any remaining bullet symbol inside lines preceded by newline or space
    res = re.sub(r"[\uf0b7\u2022\u25cf\u25aa\u25b8\u2023\u2043][ \t]*", "• ", res)
    return res


def format_address_blocks(text: str) -> str:
    """
    Ensures postal address blocks retain line breaks ('\n') between address lines.
    Handles lines ending with a colon followed by address lines (street, postal code, city, country).
    E.g.: '21 Rue Curnonsky\n75017 Paris\nFrance'
    """
    pattern = re.compile(
        r"(?m)^([ \t]*\d+[^,\n\r]+?(?:Rue|Avenue|Boulevard|Place|Chemin|Route|Allée|Voie|Street|St|Ave|Road|Highway)[^\d\n\r]*?)"
        r"[ \t\r\n]*(\d{5})[ \t\r\n]*([A-Za-zÀ-ÿ\-]+?)"
        r"(?:[ \t\r\n]*(France|États-Unis|Belgique|Suisse|Canada))?(?=\b|\n|\Z)",
        re.IGNORECASE,
    )

    def repl(m: re.Match) -> str:
        parts = [m.group(1).strip(), f"{m.group(2).strip()} {m.group(3).strip()}"]
        if m.group(4):
            parts.append(m.group(4).strip())
        return "\n".join(parts)

    return pattern.sub(repl, text)


def is_heading(line: str) -> tuple[bool, int, str]:
    """
    Detects if a stripped line is a Section heading.
    Returns (is_heading, level, cleaned_heading).
    Level 1: Primary article (e.g. '1. OBJET', '2. HÉBERGEUR').
    Level 2: Sub-clause (e.g. '4.1 Données de compte').
    """
    line_clean = line.strip()
    if not line_clean:
        return False, 0, ""

    # Normalize heading spacing: '7 . ' -> '7. '
    line_clean = re.sub(r"^(\d+)\s+\.\s*", r"\1. ", line_clean)

    # Check Level 2 first
    if LEVEL_2_HEADING_REGEX.match(line_clean) and len(line_clean) < 100:
        return True, 2, line_clean

    # Check Level 1
    if LEVEL_1_HEADING_REGEX.match(line_clean) and len(line_clean) < 120:
        return True, 1, line_clean

    return False, 0, ""


def parse_pdf_sections(text: str) -> list[dict[str, Any]]:
    """
    Parses document text into an ordered list of LegalSection dictionaries:
    [{'heading': str, 'level'?: 1 | 2, 'body': [str, ...]}, ...]
    """
    normalized = normalize_bullets(text)
    normalized = format_address_blocks(normalized)

    # The client's brief is explicit that REVIME is not a SAS (Malek KLIMANE is an entrepreneur
    # individuel). A source that says otherwise is not ours to correct: stop and ask the client.
    if re.search(r"\bSAS\b", normalized):
        raise ValueError("The source text mentions 'SAS'; it is not rewritten silently, ask the client.")

    raw_lines = [l.strip() for l in normalized.splitlines()]

    # Skip title and 'Dernière mise à jour' header lines if present at the top
    start_idx = 0
    for idx, l in enumerate(raw_lines):
        if "Dernière mise à jour" in l or "Derniere mise a jour" in l:
            start_idx = idx + 1
            break

    lines = raw_lines[start_idx:]

    sections: list[dict[str, Any]] = []
    current_heading = ""
    current_level = 1
    current_body: list[str] = []

    def flush_section():
        nonlocal current_heading, current_level, current_body
        if current_heading or current_body:
            sec: dict[str, Any] = {
                "heading": current_heading,
                "body": _process_raw_body_lines(current_body),
            }
            if current_level == 2:
                sec["level"] = 2
            elif current_heading:
                sec["level"] = 1
            sections.append(sec)
            current_body = []

    i = 0
    while i < len(lines):
        line = lines[i]
        if not line:
            i += 1
            continue

        heading_found, level, clean_h = is_heading(line)
        if heading_found:
            while heading_ends_with_prep(clean_h) and i + 1 < len(lines):
                i += 1
                clean_h += " " + lines[i].strip()
            flush_section()
            current_heading = clean_h
            current_level = level
        else:
            current_body.append(line)
        i += 1

    flush_section()
    return sections


def _process_raw_body_lines(lines: list[str]) -> list[str]:
    """
    Groups raw lines belonging to a section into distinct body paragraphs:
    - Bullet points start with '• ' and absorb continuation lines.
    - Address blocks preserve multi-line format with '\\n'.
    - Key labels ending in ':' form distinct items.
    - Standard prose lines are concatenated into full paragraphs.
    """
    paragraphs: list[str] = []
    current_para: list[str] = []

    def flush_para():
        nonlocal current_para
        if current_para:
            blocks: list[str] = []
            for p in current_para:
                if not blocks:
                    blocks.append(p)
                    continue
                prev = blocks[-1]
                if (
                    not prev.endswith((".", "!", "?", ";", ":", ","))
                    and not ends_with_preposition(prev)
                    and not ARTICLE_REFERENCE_END.search(prev)
                    and p[0].isupper()
                    and not (prev.count("(") > prev.count(")"))
                    and not (prev.endswith("Stripe") and p.startswith(("Connect", "Identity")))
                    and not (prev.endswith("Connected") and p.startswith("Account"))
                    and not (prev.endswith("Protection") and p.startswith("REVIME"))
                    and not (prev.endswith("UE–") and p.startswith("États-Unis"))
                    and not (prev.endswith("utiliser") and p.startswith("REVIME"))
                    and not (prev.endswith("numéro") and p.startswith("SIRET"))
                ):
                    # The previous line is complete on its own (a name, a label, a table cell):
                    # the client's line break stays a paragraph break and no full stop is invented.
                    blocks.append(p)
                else:
                    blocks[-1] = join_wrapped(prev, p)
            paragraphs.extend(b.strip() for b in blocks if b.strip())
            current_para = []

    i = 0
    while i < len(lines):
        line = lines[i]

        # Check for address block start or content (generalized street pattern or Curnonsky)
        is_street = bool(re.match(r"^\d+\s+(?:Rue|Avenue|Boulevard|Place|Chemin|Route|Allée|Voie|Street|St|Ave|Road|Highway)\b", line, re.IGNORECASE))
        if is_street or "Rue Curnonsky" in line:
            flush_para()
            # Capture subsequent lines for address (postal code + city, country)
            addr_parts = [line]
            if i + 1 < len(lines) and (re.search(r"\b\d{5}\b", lines[i + 1]) or "Paris" in lines[i + 1]):
                i += 1
                addr_parts.append(lines[i])
                if i + 1 < len(lines) and lines[i + 1].strip() in ("France", "États-Unis", "Belgique", "Suisse", "Canada"):
                    i += 1
                    addr_parts.append(lines[i])
            paragraphs.append("\n".join(addr_parts))
            i += 1
            continue

        # Check for hosting provider addresses with newline / URL
        if "440 N Barranca" in line or "525 Brannan" in line or "3500 S. DuPont" in line:
            flush_para()
            # If line ends with continuation or url on next line
            full_addr = line
            if i + 1 < len(lines) and lines[i + 1].startswith("https://"):
                i += 1
                full_addr += " " + lines[i]
            paragraphs.append(full_addr)
            i += 1
            continue

        # Bullet point item
        if line.startswith("• "):
            flush_para()
            bullet_parts = [line]
            # Absorb continuation lines that don't start with bullet or look like a new label/heading/numbered item
            while i + 1 < len(lines):
                nxt = lines[i + 1]
                if nxt.startswith("• ") or (nxt.endswith(":") and not nxt[0].islower()) or is_heading(nxt)[0]:
                    break
                # Only break on numbered clauses like '3. Note du réparateur', not article references like 'conditions de l\'article\n9.'
                if re.match(r"^\d+\.\s+[A-Za-zÀ-ÿ]", nxt) and not re.search(r"\b(?:article|art\.?|loi|décret)\s*$", bullet_parts[-1], re.IGNORECASE):
                    break
                if bullet_parts[-1].rstrip().endswith((";", ".")):
                    break
                prev_text = bullet_parts[-1].rstrip()
                is_continuation = (
                    nxt[0].islower()
                    or nxt[0].isdigit()
                    or nxt[0] in "([«\"'"
                    or prev_text.endswith((",", "-", "—", "«", "(", "par", "de", "d'"))
                    or ends_with_preposition(prev_text)
                    or (prev_text.endswith("Stripe") and nxt.startswith("Identity"))
                    or (not prev_text.endswith((";", ".")) and len(nxt.split()) <= 4 and nxt.endswith((".", ";")))
                )
                if is_continuation:
                    i += 1
                    bullet_parts.append(nxt)
                else:
                    break
            bullet = bullet_parts[0]
            for part in bullet_parts[1:]:
                bullet = join_wrapped(bullet, part)
            paragraphs.append(bullet)
            i += 1
            continue

        # Corporate / legal metadata lines in Éditeur / Identité section
        if line == "Entrepreneur individuel":
            flush_para()
            paragraphs.append(line)
            i += 1
            continue

        if line.startswith("Nom commercial :"):
            flush_para()
            paragraphs.append(line)
            i += 1
            continue

        # Quoted standalone document references e.g. « Informations relatives au paiement », « Protection REVIME »
        if line.startswith("«") and line.endswith("»"):
            flush_para()
            paragraphs.append(line)
            i += 1
            continue

        # Numbered sub-items inside a section like '1. Correspondance avec la demande', '3. Note du réparateur'
        if re.match(r"^\d+\.\s+[A-Za-zÀ-ÿ]", line) and not is_heading(line)[0]:
            flush_para()
            current_para.append(line)
            if line.endswith((".", "!", "?")):
                flush_para()
            i += 1
            continue

        # Key labels ending in ':' (e.g. 'Adresse professionnelle :', 'Activité :', etc.)
        if line.endswith(":") and len(line) < 100:
            if current_para and (
                line[0].islower()
                or ends_with_preposition(current_para[-1])
                or ARTICLE_REFERENCE_END.search(current_para[-1])
                or current_para[-1].endswith(",")
            ):
                current_para.append(line)
                flush_para()
                i += 1
                continue
            flush_para()
            paragraphs.append(line)
            i += 1
            continue

        # Normal prose line
        current_para.append(line)
        # If line ends with a period, exclamation, question mark, colon, or semicolon, it might be paragraph end
        if line.endswith((".", "!", "?")):
            flush_para()

        i += 1

    flush_para()
    return paragraphs


def parse_pdf_to_document(pdf_path: str, doc_key: str = "", doc_title: str = "") -> dict[str, Any]:
    """
    Extracts text from a PDF file using pypdf and converts it into a LegalDocument dictionary.
    """
    if pypdf is None:
        raise RuntimeError("pypdf is not installed. Please install pypdf to extract legal PDFs.")

    reader = pypdf.PdfReader(pdf_path)
    pages_text: list[str] = []
    for page in reader.pages:
        txt = page.extract_text()
        if txt:
            pages_text.append(txt)

    full_text = repair_extraction_artifacts("\n".join(pages_text))

    # Determine title
    title = doc_title
    if not title:
        first_lines = [l.strip() for l in full_text.splitlines() if l.strip()]
        if first_lines:
            title = first_lines[0]

    # The title is shown as the client wrote it: it has to be the PDF's own first line.
    if " ".join(full_text.split()).replace(" ", "").find(title.replace(" ", "")) != 0:
        raise ValueError(f"{pdf_path} does not start with the title {title!r}")

    # Determine updated date
    updated_match = re.search(r"Derni[eè]re\s+mise\s+[aà]\s+jour\s*:[^\n]+", full_text, re.IGNORECASE)
    if not updated_match:
        raise ValueError(f"No 'Dernière mise à jour' line in {pdf_path}")
    updated = updated_match.group(0).strip()

    # Normalize accents in updated date if needed
    if "Derniere" in updated:
        updated = updated.replace("Derniere", "Dernière")
    if " a " in updated:
        updated = updated.replace(" a ", " à ")

    sections = parse_pdf_sections(full_text)

    return {
        "title": title,
        "updated": updated,
        "sections": sections,
    }


def to_ts_string(s: str) -> str:
    """Escapes a python string into a single-quoted TypeScript string literal."""
    escaped = s.replace("\r", "")
    escaped = escaped.replace("\\", "\\\\")
    escaped = escaped.replace("'", "\\'")
    escaped = escaped.replace("\n", "\\n")
    return f"'{escaped}'"


def generate_typescript_content(doc: dict[str, Any], const_name: str) -> str:
    """
    Generates a TypeScript file conforming to LegalDocument.
    """
    lines: list[str] = [
        "import type { LegalDocument } from './types';",
        "",
        f"export const {const_name}: LegalDocument = {{",
        f"  title: {to_ts_string(doc['title'])},",
        f"  updated: {to_ts_string(doc['updated'])},",
        "  sections: [",
    ]

    for section in doc["sections"]:
        lines.append("    {")
        lines.append(f"      heading: {to_ts_string(section['heading'])},")
        if section.get("level") in (1, 2):
            lines.append(f"      level: {section['level']},")
        lines.append("      body: [")
        for p in section["body"]:
            lines.append(f"        {to_ts_string(p)},")
        lines.append("      ],")
        lines.append("    },")

    lines.append("  ],")
    lines.append("};")
    lines.append("")

    return "\n".join(lines)


def run_pipeline(
    pdf_dir: str = "assets/originals/legal",
    output_dir: str = "apps/mobile/src/lib/legal",
    dry_run: bool = False,
) -> list[str]:
    """
    Processes all 11 source legal PDFs and generates corresponding TypeScript files.
    """
    generated: list[str] = []
    os.makedirs(output_dir, exist_ok=True)

    for item in DOC_DEFINITIONS:
        pdf_name = item["pdf"]
        target_file = item["file"]
        const_name = item["const"]
        title = item["title"]

        pdf_path = os.path.join(pdf_dir, pdf_name)
        if not os.path.exists(pdf_path):
            # Match by keywords in case filename has filesystem encoding anomalies
            matched = None
            for fname in os.listdir(pdf_dir):
                if not fname.lower().endswith(".pdf"):
                    continue
                fname_lower = fname.lower()
                if all(kw in fname_lower for kw in item["keywords"]):
                    matched = fname
                    break
            if matched:
                pdf_path = os.path.join(pdf_dir, matched)
            else:
                print(f"[WARN] PDF not found: {pdf_name}")
                continue

        doc = parse_pdf_to_document(pdf_path, doc_key=target_file, doc_title=title)
        ts_content = generate_typescript_content(doc, const_name=const_name)

        out_path = os.path.join(output_dir, target_file)
        if not dry_run:
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(ts_content)
            print(f"[OK] Generated {out_path} ({len(doc['sections'])} sections)")
        else:
            print(f"[DRY-RUN] Processed {pdf_name} -> {target_file} ({len(doc['sections'])} sections)")

        generated.append(out_path)

    return generated


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Legal Document Extractor Pipeline for REVIME.")
    parser.add_argument("--dry-run", action="store_true", help="Process and validate PDFs without writing output files.")
    parser.add_argument("--pdf-dir", default=None, help="Directory containing source PDF files.")
    parser.add_argument("--output-dir", default=None, help="Output directory for generated TypeScript files.")
    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pdf_dir = args.pdf_dir or os.path.join(base_dir, "assets", "originals", "legal")
    out_dir = args.output_dir or os.path.join(base_dir, "apps", "mobile", "src", "lib", "legal")

    print(f"Running legal docs extraction pipeline...")
    print(f"Source PDF dir: {pdf_dir}")
    print(f"Target TS dir:  {out_dir}")

    results = run_pipeline(pdf_dir=pdf_dir, output_dir=out_dir, dry_run=args.dry_run)
    print(f"Done! Successfully processed {len(results)} legal documents.")


if __name__ == "__main__":
    main()
