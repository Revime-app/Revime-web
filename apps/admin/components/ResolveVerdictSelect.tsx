import React from 'react';
import { REPORT_RESOLUTION_VERDICTS, REPORT_RESOLUTION_VERDICT_LABEL } from '@revime/shared';
import { NO_VERDICT, parseVerdictChoice, type VerdictChoice } from '../lib/report-resolution';

export function ResolveVerdictSelect({
  value,
  onChange,
  disabled,
}: {
  value: VerdictChoice;
  onChange: (next: VerdictChoice) => void;
  disabled: boolean;
}) {
  return (
    <select
      id="resolve-verdict-select"
      value={value}
      required
      onChange={(e) => onChange(parseVerdictChoice(e.target.value) ?? NO_VERDICT)}
      style={{
        width: '100%',
        padding: '8px 12px',
        borderRadius: 'var(--r-field, 4px)',
        border: '1px solid var(--line)',
        fontSize: '14px',
      }}
      disabled={disabled}
    >
      <option value={NO_VERDICT} disabled>
        Choisir un verdict…
      </option>
      {REPORT_RESOLUTION_VERDICTS.map((v) => (
        <option key={v} value={v}>
          {REPORT_RESOLUTION_VERDICT_LABEL[v]}
        </option>
      ))}
    </select>
  );
}
