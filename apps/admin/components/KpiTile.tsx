import Link from 'next/link';
import { formatKpiCents, formatKpiCount, type KpiValue } from '@revime/shared';
import { formatPercentage } from '../lib/money';

type Props = {
  label: string;
  value: KpiValue;
  note?: string;
  money?: boolean;
  href?: string;
  /**
   * A rise is bad news (open disputes, refunds, payments waiting, ...): the variation is coloured red
   * when it goes up and green when it goes down. Green for « more disputes » would tell an operator the
   * opposite of what the number means.
   */
  badWhenUp?: boolean;
};

/**
 * Dumb by design: every decision about what to display lives in the shared formatters, so the
 * component stays a thin shell and its output is checked with `renderToString` (no jsdom here).
 */
export function KpiTile({ label, value, note, money = false, href, badWhenUp = false }: Props) {
  const unavailable = value.kind === 'unavailable';
  const trendMom = value.kind === 'value' ? value.mom : undefined;

  const content = (
    <>
      <p className="kpi__label">{label}</p>
      <p className="kpi__value">{money ? formatKpiCents(value) : formatKpiCount(value)}</p>
      {trendMom !== undefined && trendMom !== null && (
        <span
          className={`kpi__trend ${
            trendMom === 0 || trendMom > 0 !== badWhenUp ? 'kpi__trend--positive' : 'kpi__trend--negative'
          }`}
        >
          {`${trendMom > 0 ? `+${formatPercentage(trendMom)}` : formatPercentage(trendMom)} vs 30j préc.`}
        </span>
      )}
      {/* An unavailable tile always shows WHY. A bare « Non applicable » invites
          somebody to file it as a bug. */}
      {(unavailable || note) && (
        <p className="kpi__note">{unavailable ? value.reason : note}</p>
      )}
    </>
  );

  if (href && !unavailable) {
    return (
      <Link href={href} className="kpi kpi--clickable" data-testid="kpi-tile-link">
        {content}
      </Link>
    );
  }

  return (
    <div className={`kpi${unavailable ? ' kpi--unavailable' : ''}`}>
      {content}
    </div>
  );
}
