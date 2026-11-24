import { REPORT_RESOLUTION_VERDICTS, type ReportResolutionVerdict } from '@revime/shared';

/**
 * The closing form starts with NO verdict. It used to start on « Sanction appliquée », so an
 * operator who only wanted to add a note could close a report as sanctioned without choosing it.
 */
export const NO_VERDICT = '' as const;

export type VerdictChoice = ReportResolutionVerdict | typeof NO_VERDICT;

/** The verdict behind a select value, or null when none was chosen. */
export function parseVerdictChoice(raw: string): ReportResolutionVerdict | null {
  return (REPORT_RESOLUTION_VERDICTS as readonly string[]).includes(raw)
    ? (raw as ReportResolutionVerdict)
    : null;
}
