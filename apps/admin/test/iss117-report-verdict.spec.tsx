import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { REPORT_RESOLUTION_VERDICTS } from '@revime/shared';
import { ResolveVerdictSelect } from '../components/ResolveVerdictSelect';
import { NO_VERDICT, parseVerdictChoice } from '../lib/report-resolution';

describe('ISS-117: closing a report needs a deliberate verdict', () => {
  it('starts with no verdict chosen', () => {
    expect(parseVerdictChoice(NO_VERDICT)).toBeNull();
  });

  it('reads every real verdict', () => {
    for (const v of REPORT_RESOLUTION_VERDICTS) expect(parseVerdictChoice(v)).toBe(v);
  });

  it('refuses anything that is not a verdict', () => {
    for (const raw of ['', 'BOGUS', 'sanction_applied', ' SANCTION_APPLIED']) {
      expect(parseVerdictChoice(raw), raw).toBeNull();
    }
  });

  it('renders the select on a disabled placeholder, with no verdict preselected', () => {
    const html = renderToString(<ResolveVerdictSelect value={NO_VERDICT} onChange={() => {}} disabled={false} />);
    const selected = html.match(/<option[^>]*selected=""[^>]*>[^<]*/g) ?? [];
    expect(selected).toHaveLength(1);
    expect(selected[0]).toContain('value=""');
    expect(selected[0]).toContain('disabled');
    for (const v of REPORT_RESOLUTION_VERDICTS) expect(html).toContain(`value="${v}"`);
  });

  it('is required, so the browser blocks a submit with no verdict', () => {
    const html = renderToString(<ResolveVerdictSelect value={NO_VERDICT} onChange={() => {}} disabled={false} />);
    expect(html).toMatch(/<select[^>]*required=""/);
  });

  it('marks the chosen verdict as selected, and only it', () => {
    const html = renderToString(
      <ResolveVerdictSelect value="DISMISSED_UNFOUNDED" onChange={() => {}} disabled={false} />,
    );
    const selected = html.match(/<option[^>]*selected=""[^>]*>[^<]*/g) ?? [];
    expect(selected).toHaveLength(1);
    expect(selected[0]).toContain('value="DISMISSED_UNFOUNDED"');
  });
});
