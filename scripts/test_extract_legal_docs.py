import os
import sys
import unittest

# Ensure the scripts directory is on sys.path for direct module import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from extract_legal_docs import (
    DOC_DEFINITIONS,
    join_wrapped,
    repair_extraction_artifacts,
    normalize_bullets,
    format_address_blocks,
    parse_pdf_sections,
    parse_pdf_to_document,
    generate_typescript_content,
)


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_DIR = os.path.join(REPO_ROOT, "assets", "originals", "legal")


def find_pdf(name, keywords):
    """The RÈGLES file name is mangled on disk, so fall back to the generator's keywords."""
    path = os.path.join(PDF_DIR, name)
    if os.path.exists(path):
        return path
    for candidate in os.listdir(PDF_DIR):
        if all(k in candidate.lower() for k in keywords):
            return os.path.join(PDF_DIR, candidate)
    raise AssertionError(f"PDF not found: {name}")


def pdf_text(path):
    import pypdf

    return "\n".join(page.extract_text() or "" for page in pypdf.PdfReader(path).pages)


def doc_lines(doc):
    yield doc["title"]
    yield doc["updated"]
    for section in doc["sections"]:
        yield section["heading"]
        yield from section["body"]


def letters_only(text):
    """Drops whitespace and bullet glyphs, so layout may differ but no character may."""
    bullets = "\uf0b7\u2022\u25cf\u25aa\u25b8\u2023\u2043\uf0a7\u25e6"
    return "".join(c for c in text if not c.isspace() and c not in bullets)


class TestLegalDocExtractor(unittest.TestCase):
    def test_normalize_bullets(self):
        raw = "\uf0b7 premier point\n second point\n\u2022 troisième point"
        expected = "• premier point\n• second point\n• troisième point"
        self.assertEqual(normalize_bullets(raw), expected)

    def test_normalize_bullets_strips_inner_leading_spaces(self):
        raw = "\uf0b7   point espacé\n• autre point"
        expected = "• point espacé\n• autre point"
        self.assertEqual(normalize_bullets(raw), expected)

    def test_format_address_blocks(self):
        raw = "Adresse professionnelle :\n21 Rue Curnonsky\n75017 Paris\nFrance\nActivité :"
        result = format_address_blocks(raw)
        self.assertIn("21 Rue Curnonsky\n75017 Paris\nFrance", result)

        # Test generalized address pattern
        raw_general = "Siège social :\n10 Avenue de l'Opéra\n75001 Paris\nFrance\nActivité :"
        result_general = format_address_blocks(raw_general)
        self.assertIn("10 Avenue de l'Opéra\n75001 Paris\nFrance", result_general)

    def test_parse_pdf_sections(self):
        text = """1. OBJET
Le présent document définit les conditions d'utilisation.
• Premier engagement
• Second engagement

2. HÉBERGEUR
Les serveurs sont hébergés par :
Vercel Inc.
Render Services, Inc.
"""
        sections = parse_pdf_sections(text)
        self.assertEqual(len(sections), 2)
        self.assertEqual(sections[0]["heading"], "1. OBJET")
        self.assertEqual(sections[0]["level"], 1)
        self.assertEqual(sections[0]["body"][0], "Le présent document définit les conditions d'utilisation.")
        self.assertTrue(any(p.startswith("• ") for p in sections[0]["body"]))
        # Verbatim heading must be preserved as 2. HÉBERGEUR without synthetic mutations
        self.assertEqual(sections[1]["heading"], "2. HÉBERGEUR")

    def test_a_source_that_says_sas_is_refused_not_rewritten(self):
        sample_raw = """MENTIONS LÉGALES — REVIME
Dernière mise à jour : 10 octobre 2026
1. ÉDITEUR DU SITE ET DE LA PLATEFORME
Le site www.revime.fr et la plateforme REVIME SAS sont édités et exploités par :
"""
        with self.assertRaises(ValueError):
            parse_pdf_sections(sample_raw)

    def test_name_and_status_stay_on_their_own_lines_without_a_comma(self):
        sample_raw = """1. ÉDITEUR DU SITE ET DE LA PLATEFORME
Le site www.revime.fr et la plateforme REVIME sont édités et exploités par :
Malek KLIMANE
Entrepreneur individuel
Nom commercial : REVIME
SIREN : 979 233 178
SIRET : 979 233 178 00040
"""
        body = parse_pdf_sections(sample_raw)[0]["body"]
        self.assertEqual(
            body[1:],
            [
                "Malek KLIMANE",
                "Entrepreneur individuel",
                "Nom commercial : REVIME",
                "SIREN : 979 233 178",
                "SIRET : 979 233 178 00040",
            ],
        )

    def test_two_lines_are_never_joined_with_an_invented_full_stop(self):
        text = """29. PRESTATAIRES
Selon les fonctionnalités utilisées, les prestataires comprennent notamment :
Stripe
Traitement des paiements et services associés aux comptes des réparateurs.
Niveau 1 — Avertissement
REVIME peut rappeler les règles applicables.
"""
        body = parse_pdf_sections(text)[0]["body"]
        self.assertEqual(
            body[1:],
            [
                "Stripe",
                "Traitement des paiements et services associés aux comptes des réparateurs.",
                "Niveau 1 — Avertissement",
                "REVIME peut rappeler les règles applicables.",
            ],
        )

    def test_a_wrapped_sentence_that_ends_in_a_colon_stays_one_paragraph(self):
        text = """7. INFORMATIONS
Selon son statut déclaré et les fonctionnalités utilisées, REVIME peut notamment
demander :
• une pièce d'identité ;
• un justificatif.
Le réparateur doit notamment s'assurer qu'il dispose, lorsque cela est
nécessaire :
• d'une assurance.
Pour tout litige, le médiateur est compétent, conformément aux articles
L611-1 et suivants du Code de la consommation :
Centre de médiation
Lorsqu'un utilisateur souhaite exercer en qualité de réparateur professionnel,
REVIME peut collecter et traiter notamment :
• un SIRET.
Exemple
Pour une réparation de 100 € :
"""
        body = parse_pdf_sections(text)[0]["body"]
        self.assertIn(
            "Selon son statut déclaré et les fonctionnalités utilisées, REVIME peut notamment demander :",
            body,
        )
        self.assertIn("Le réparateur doit notamment s'assurer qu'il dispose, lorsque cela est nécessaire :", body)
        self.assertIn(
            "Pour tout litige, le médiateur est compétent, conformément aux articles L611-1 et suivants du Code de la consommation :",
            body,
        )
        self.assertIn(
            "Lorsqu'un utilisateur souhaite exercer en qualité de réparateur professionnel, REVIME peut collecter et traiter notamment :",
            body,
        )
        # A short label that starts a new line is still a label, not the tail of the line above.
        self.assertIn("Exemple", body)
        self.assertIn("Pour une réparation de 100 € :", body)

    def test_an_article_number_on_the_next_line_belongs_to_the_sentence_above(self):
        text = """20. MÉDIATION
Le consommateur peut recourir au médiateur de la consommation, conformément aux articles
L611-1 et suivants du Code de la consommation.
"""
        body = parse_pdf_sections(text)[0]["body"]
        self.assertEqual(
            body,
            [
                "Le consommateur peut recourir au médiateur de la consommation, conformément aux articles"
                " L611-1 et suivants du Code de la consommation."
            ],
        )

    def test_a_bullet_wrapped_onto_a_line_ending_in_a_colon_stays_one_bullet(self):
        text = """9. DONNÉES
• certains traitements nécessitant un consentement, notamment
afin :
• de sécuriser le compte ;
"""
        body = parse_pdf_sections(text)[0]["body"]
        self.assertEqual(body, ["• certains traitements nécessitant un consentement, notamment afin :", "• de sécuriser le compte ;"])

    def test_a_block_before_the_first_heading_gets_no_invented_heading(self):
        text = """REVIME présente les réparateurs dans les résultats.
1. CRITÈRES
Le classement prend en compte plusieurs critères.
"""
        sections = parse_pdf_sections(text)
        self.assertEqual(sections[0]["heading"], "")
        self.assertNotIn("level", sections[0])
        self.assertEqual(sections[1]["heading"], "1. CRITÈRES")

    def test_extraction_artifacts_are_repaired_and_real_spaces_are_kept(self):
        self.assertEqual(
            repair_extraction_artifacts("2,90 € + 4,50 € = 7 ,40 €\nTotal : 107 ,40 €\n4. ORDRE D’ AFFICHAGE"),
            "2,90 € + 4,50 € = 7,40 €\nTotal : 107,40 €\n4. ORDRE D’AFFICHAGE",
        )
        # A comma after a word, a percentage and a normal elision are not touched, and a comma
        # that follows a number but does not lead into one is punctuation, not a decimal point.
        self.assertEqual(
            repair_extraction_artifacts("de 2,90 € , soit 4,5 % du montant, l'utilisateur"),
            "de 2,90 € , soit 4,5 % du montant, l'utilisateur",
        )
        self.assertEqual(
            repair_extraction_artifacts("au plus 100 , puis 2,90 €"),
            "au plus 100 , puis 2,90 €",
        )

    def test_a_hyphen_at_a_line_end_continues_the_word(self):
        self.assertEqual(join_wrapped("aux articles L221-", "25 et L221-28"), "aux articles L221-25 et L221-28")
        self.assertEqual(join_wrapped("à ce que celui-", "ci soit emballé"), "à ce que celui-ci soit emballé")
        # A spaced dash is punctuation, not a hyphenated word.
        self.assertEqual(join_wrapped("pour le client -", "le réparateur"), "pour le client - le réparateur")

    def test_every_generated_document_is_the_text_of_its_pdf(self):
        """T1: nothing is added to, removed from or rewritten in the client's text."""
        for item in DOC_DEFINITIONS:
            with self.subTest(pdf=item["pdf"]):
                pdf_path = find_pdf(item["pdf"], item["keywords"])
                doc = parse_pdf_to_document(pdf_path, doc_key=item["file"], doc_title=item["title"])
                self.assertEqual(
                    letters_only("\n".join(doc_lines(doc))),
                    letters_only(repair_extraction_artifacts(pdf_text(pdf_path))),
                )

    def test_committed_typescript_files_are_what_the_generator_writes(self):
        """A hand edit of a legal file, or a generator change nobody ran, fails here."""
        legal_dir = os.path.join(REPO_ROOT, "apps", "mobile", "src", "lib", "legal")
        for item in DOC_DEFINITIONS:
            with self.subTest(file=item["file"]):
                pdf_path = find_pdf(item["pdf"], item["keywords"])
                doc = parse_pdf_to_document(pdf_path, doc_key=item["file"], doc_title=item["title"])
                expected = generate_typescript_content(doc, const_name=item["const"])
                with open(os.path.join(legal_dir, item["file"]), encoding="utf-8", newline="") as f:
                    committed = f.read().replace("\r\n", "\n")
                self.assertEqual(committed, expected)

    def test_a_title_the_pdf_does_not_open_with_is_refused(self):
        item = DOC_DEFINITIONS[0]
        pdf_path = find_pdf(item["pdf"], item["keywords"])
        with self.assertRaises(ValueError):
            parse_pdf_to_document(pdf_path, doc_key=item["file"], doc_title="CONDITIONS D'UTILISATION — REVIME")

    def test_each_title_is_the_first_line_of_its_pdf(self):
        for item in DOC_DEFINITIONS:
            with self.subTest(pdf=item["pdf"]):
                first = " ".join(pdf_text(find_pdf(item["pdf"], item["keywords"])).split())
                self.assertTrue(first.startswith(item["title"]), first[:80])

    def test_generate_typescript_content(self):
        doc = {
            "title": "CONDITIONS GÉNÉRALES D'UTILISATION — REVIME",
            "updated": "Dernière mise à jour : 10 octobre 2026",
            "sections": [
                {
                    "heading": "1. OBJET",
                    "level": 1,
                    "body": [
                        "Premier paragraphe explicatif.",
                        "• Point un",
                        "21 Rue Curnonsky\n75017 Paris\nFrance",
                    ],
                }
            ],
        }
        ts = generate_typescript_content(doc, const_name="CGU")
        self.assertIn("import type { LegalDocument } from './types';", ts)
        self.assertIn("export const CGU: LegalDocument = {", ts)
        self.assertIn("CONDITIONS GÉNÉRALES D\\'UTILISATION — REVIME", ts)
        self.assertIn("Dernière mise à jour : 10 octobre 2026", ts)
        self.assertIn("'1. OBJET'", ts)
        self.assertIn("level: 1", ts)
        self.assertIn("'• Point un'", ts)
        self.assertIn("21 Rue Curnonsky\\n75017 Paris\\nFrance", ts)

    def test_parse_pdf_to_document_on_archived_pdf(self):
        pdf_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "assets",
            "originals",
            "legal",
            "CGU T.pdf",
        )
        self.assertTrue(os.path.exists(pdf_path), f"Archived PDF fixture missing: {pdf_path}")
        doc = parse_pdf_to_document(pdf_path, doc_key="cgu.ts", doc_title="CONDITIONS GÉNÉRALES D’UTILISATION — REVIME")
        self.assertEqual(doc["title"], "CONDITIONS GÉNÉRALES D’UTILISATION — REVIME")
        self.assertIn("10 octobre 2026", doc["updated"])
        self.assertGreater(len(doc["sections"]), 10)
        # Verify bullets are normalized
        has_bullets = any(p.startswith("• ") for s in doc["sections"] for p in s["body"])
        self.assertTrue(has_bullets)

    def test_heading_detection_with_em_dash_and_bis(self):
        text = """52. RELATIONS ENTRE PARTICULIERS
Texte article 52.
53. RÉPARATEURS PARTICULIERS — ACTIVITÉ OCCASIONNELLE
Texte article 53.
55. RÈGLEMENT DES SERVICES NUMÉRIQUES — DSA
Texte article 55.
19 bis. MINEURS
Texte article 19 bis.
4.1 Données de compte
Texte clause 4.1.
"""
        sections = parse_pdf_sections(text)
        headings = [s["heading"] for s in sections]
        self.assertIn("53. RÉPARATEURS PARTICULIERS — ACTIVITÉ OCCASIONNELLE", headings)
        self.assertIn("55. RÈGLEMENT DES SERVICES NUMÉRIQUES — DSA", headings)
        self.assertIn("19 bis. MINEURS", headings)
        self.assertIn("4.1 Données de compte", headings)
        sec_4_1 = next(s for s in sections if s["heading"] == "4.1 Données de compte")
        self.assertEqual(sec_4_1.get("level"), 2)

    def test_bullet_does_not_swallow_numbered_criteria_or_concluding_prose(self):
        text = """2. CRITÈRES
Ce critère peut notamment être pertinent pour :
• un dépôt en atelier ;
• certaines modalités de remise de l'objet.
La distance n'est pas nécessairement utilisée lorsque celle-ci n'apporte pas de valeur.
3. Note du réparateur
La note moyenne obtenue grâce aux avis des utilisateurs peut être prise en compte.
"""
        sections = parse_pdf_sections(text)
        sec = sections[0]
        self.assertEqual(sec["heading"], "2. CRITÈRES")
        # Ensure the bullet ended cleanly
        self.assertIn("• certaines modalités de remise de l'objet.", sec["body"])
        # Ensure concluding prose and criterion 3 are distinct
        self.assertTrue(any("La distance n'est pas nécessairement utilisée" in b for b in sec["body"]))
        self.assertTrue(any("3. Note du réparateur" in b for b in sec["body"]))

    def test_wrapped_heading_absorption(self):
        text = """9 bis. DONNÉES COLLECTÉES AU TITRE DES OBLIGATIONS FISCALES DE LA
PLATEFORME
En tant qu'opérateur de plateforme, REVIME est tenue de collecter certaines informations.
"""
        sections = parse_pdf_sections(text)
        self.assertEqual(len(sections), 1)
        self.assertEqual(
            sections[0]["heading"],
            "9 bis. DONNÉES COLLECTÉES AU TITRE DES OBLIGATIONS FISCALES DE LA PLATEFORME",
        )
        self.assertTrue(sections[0]["body"][0].startswith("En tant qu'opérateur"))

    def test_bullet_continuation_with_article_ref_and_parentheses(self):
        text = """1. MODÉRATION
• Contrôle : les avis font l'objet d'un contrôle dans les conditions de l'article
9.
• identifiant du compte bancaire sur lequel les versements sont effectués
(IBAN) ;
• certains traitements nécessitant un consentement, notamment la vérification faciale réalisée par Stripe
Identity.
"""
        sections = parse_pdf_sections(text)
        self.assertEqual(len(sections), 1)
        body = sections[0]["body"]
        self.assertIn(
            "• Contrôle : les avis font l'objet d'un contrôle dans les conditions de l'article 9.",
            body,
        )
        self.assertIn(
            "• identifiant du compte bancaire sur lequel les versements sont effectués (IBAN) ;",
            body,
        )
        self.assertIn(
            "• certains traitements nécessitant un consentement, notamment la vérification faciale réalisée par Stripe Identity.",
            body,
        )

    def test_run_pipeline_dry_run_all_11_documents(self):
        from extract_legal_docs import run_pipeline

        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        pdf_dir = os.path.join(base_dir, "assets", "originals", "legal")
        out_dir = os.path.join(base_dir, "apps", "mobile", "src", "lib", "legal")

        results = run_pipeline(pdf_dir=pdf_dir, output_dir=out_dir, dry_run=True)
        self.assertEqual(len(results), 11)


if __name__ == "__main__":
    unittest.main()


