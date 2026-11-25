'use client';

import Link from 'next/link';
import { IconChevronRight } from './icons';

/** The app's SettingsSection / SettingsRow (apps/mobile/src/components/Settings*), as a web list. */
export function SettingsSection({ title, children }: { title: string | null; children: React.ReactNode }) {
  return (
    <section className="ap-set">
      {title && <h2 className="ap-set__title">{title}</h2>}
      <div className="ap-set__card">{children}</div>
    </section>
  );
}

type RowProps = {
  label: string;
  value?: string | null;
  hint?: string | null;
  href?: string;
  onClick?: (() => void) | null;
  destructive?: boolean;
  disabled?: boolean;
  external?: boolean;
};

export function SettingsRow({ label, value, hint, href, onClick, destructive, disabled, external }: RowProps) {
  const body = (
    <>
      <span className="ap-set__label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {value && <span className="ap-set__value">{value}</span>}
      {(href || onClick) && !destructive && <IconChevronRight size={18} />}
    </>
  );
  const cls = `ap-set__row${destructive ? ' is-danger' : ''}`;
  if (href && !disabled) {
    return external ? (
      <a className={cls} href={href}>
        {body}
      </a>
    ) : (
      <Link className={cls} href={href}>
        {body}
      </Link>
    );
  }
  if (onClick && !disabled) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={`${cls} is-static`}>{body}</div>;
}

/** The app's switch rows (Paramètres → Notifications). */
export function SettingsToggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="ap-set__row ap-set__toggle">
      <span className="ap-set__label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="ap-toggle" aria-hidden="true" />
    </label>
  );
}
