import type { ReactNode } from 'react';

export function KpiGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="group">
      <h2 className="group__title">{title}</h2>
      <div className="group__tiles">{children}</div>
    </section>
  );
}
