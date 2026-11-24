'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { AdminStatsOverviewDto } from '@revime/shared';
import { formatEuros, formatCount, formatPercentage } from './StatsKpiCards';
import { SortableTh } from '../../components/SortableTh';
import { CsvExportButton } from '../../components/CsvExportButton';
import { compareValues, type SortDirection } from '../../lib/table-sort';
import { generateCsv, downloadCsv, type CsvColumn } from '../../lib/export-csv';
import { RankMedal } from '../../components/RankMedal';

/** The API sends the top of every sortable column (up to 40 rows); the table shows the first ten of the sort. */
export const LEADERBOARD_SIZE = 10;

export interface RepairerLeaderboardViewProps {
  topRepairers: AdminStatsOverviewDto['topRepairers'];
}

type RankedRepairer = AdminStatsOverviewDto['topRepairers'][number] & {
  originalRank: number;
};

const REPAIRER_CSV_COLUMNS: CsvColumn<RankedRepairer>[] = [
  { key: 'originalRank', label: 'Rang' },
  { key: 'name', label: 'Réparateur' },
  { key: 'businessName', label: 'Entreprise', format: (val) => (val as string) ?? '' },
  { key: 'city', label: 'Localisation', format: (val) => (val as string) ?? 'France' },
  { key: 'offersSent', label: 'Offres envoyées' },
  { key: 'offersAccepted', label: 'Offres acceptées' },
  {
    key: 'acceptanceRate',
    label: 'Conversion',
    format: (val) => `${Number(val ?? 0).toFixed(1).replace('.', ',')} %`,
  },
  {
    key: 'totalRevenueCents',
    label: "Chiffre d'affaires",
    format: (val) => `${(Number(val ?? 0) / 100).toFixed(2).replace('.', ',')} €`,
  },
  {
    key: 'rating',
    label: 'Note',
    format: (val) => (val !== null && val !== undefined ? Number(val).toFixed(1).replace('.', ',') : 'N/A'),
  },
  { key: 'reviewsCount', label: "Nombre d'avis" },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return 'R';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getRankBadge(rank: number) {
  if (rank <= 3) return <RankMedal rank={rank} />;
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '12px',
        fontWeight: 700,
        color: 'var(--muted, #6b7280)',
        minWidth: '24px',
        textAlign: 'center',
      }}
    >
      #{rank}
    </span>
  );
}

export function RepairerLeaderboardView({ topRepairers }: RepairerLeaderboardViewProps) {
  const [sortKey, setSortKey] = useState<string>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const itemsWithRank: RankedRepairer[] = useMemo(() => {
    return topRepairers.map((rep, idx) => ({
      ...rep,
      originalRank: idx + 1,
    }));
  }, [topRepairers]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'rank' || key === 'repairer' || key === 'name' ? 'asc' : 'desc');
    }
  };

  const sortedRepairers = useMemo(() => {
    return [...itemsWithRank].sort((a, b) => {
      let valA: unknown;
      let valB: unknown;

      switch (sortKey) {
        case 'rank':
          valA = a.originalRank;
          valB = b.originalRank;
          break;
        case 'repairer':
        case 'name':
          valA = a.name;
          valB = b.name;
          break;
        case 'offersSent':
          valA = a.offersSent;
          valB = b.offersSent;
          break;
        case 'acceptedOffers':
        case 'offersAccepted':
          valA = a.offersAccepted;
          valB = b.offersAccepted;
          break;
        case 'conversion':
        case 'acceptanceRate':
          valA = a.acceptanceRate;
          valB = b.acceptanceRate;
          break;
        case 'totalRevenueCents':
        case 'revenue':
          valA = a.totalRevenueCents;
          valB = b.totalRevenueCents;
          break;
        default:
          valA = a.originalRank;
          valB = b.originalRank;
      }

      return compareValues(valA, valB, sortDirection);
    });
  }, [itemsWithRank, sortKey, sortDirection]);

  const visibleRepairers = useMemo(() => sortedRepairers.slice(0, LEADERBOARD_SIZE), [sortedRepairers]);

  const handleExportCsv = () => {
    if (visibleRepairers.length === 0) return;
    const csvContent = generateCsv(REPAIRER_CSV_COLUMNS, visibleRepairers, { delimiter: ';' });
    downloadCsv(`reparateurs-actifs-${new Date().toISOString().slice(0, 10)}`, csvContent);
  };

  return (
    <div className="card" style={{ marginBottom: '28px', padding: '20px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--ink, #1f2937)' }}>
            Réparateurs les plus actifs
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
            Top 10 selon la colonne triée (offres envoyées par défaut), parmi tous les réparateurs de la période
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {topRepairers.length > 0 && (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--muted, #6b7280)',
                backgroundColor: 'var(--navy-soft, #f0f1f5)',
                padding: '2px 8px',
                borderRadius: 'var(--r-pill, 999px)',
              }}
            >
              {topRepairers.length} réparateurs classés
            </span>
          )}
          <CsvExportButton
            onClick={handleExportCsv}
            count={topRepairers.length}
            disabled={topRepairers.length === 0}
          />
        </div>
      </div>

      {topRepairers.length === 0 ? (
        <div
          style={{
            padding: '40px 16px',
            textAlign: 'center',
            color: 'var(--muted, #6b7280)',
            backgroundColor: 'var(--canvas)',
            borderRadius: 'var(--r-field, 6px)',
          }}
        >
          <p style={{ margin: 0, fontSize: '14px' }}>Aucun réparateur actif trouvé pour cette période.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr>
                <SortableTh
                  columnKey="rank"
                  activeKey={sortKey}
                  direction={sortDirection}
                  label="Rang"
                  onSort={toggleSort}
                  align="center"
                  style={{ width: '60px' }}
                />
                <SortableTh
                  columnKey="repairer"
                  activeKey={sortKey}
                  direction={sortDirection}
                  label="Réparateur"
                  onSort={toggleSort}
                  align="left"
                />
                <th
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--muted, #6b7280)',
                    borderBottom: '1px solid var(--line, #dfe2e2)',
                  }}
                >
                  Localisation
                </th>
                <SortableTh
                  columnKey="offersSent"
                  activeKey={sortKey}
                  direction={sortDirection}
                  label="Offres envoyées"
                  onSort={toggleSort}
                  align="right"
                />
                <SortableTh
                  columnKey="acceptedOffers"
                  activeKey={sortKey}
                  direction={sortDirection}
                  label="Offres acceptées"
                  onSort={toggleSort}
                  align="right"
                />
                <SortableTh
                  columnKey="conversion"
                  activeKey={sortKey}
                  direction={sortDirection}
                  label="Conversion"
                  onSort={toggleSort}
                  align="right"
                />
                <SortableTh
                  columnKey="totalRevenueCents"
                  activeKey={sortKey}
                  direction={sortDirection}
                  label="Chiffre d'affaires"
                  onSort={toggleSort}
                  align="right"
                />
                <th
                  style={{
                    textAlign: 'right',
                    padding: '10px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--muted, #6b7280)',
                    borderBottom: '1px solid var(--line, #dfe2e2)',
                  }}
                >
                  Note & Avis
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRepairers.map((rep) => {
                const rank = rep.originalRank;
                const initials = getInitials(rep.name);

                let badgeBg = 'var(--navy-soft, #f0f1f5)';
                let badgeColor = 'var(--muted, #4b5563)';
                if (rep.acceptanceRate >= 50) {
                  badgeBg = 'var(--green-soft, #e7f8f0)';
                  badgeColor = 'var(--green-deep, #0a8a50)';
                } else if (rep.acceptanceRate >= 25) {
                  badgeBg = 'var(--badge-info-bg)';
                  badgeColor = 'var(--badge-info-text)';
                }

                return (
                  <tr key={rep.repairerId}>
                    {/* Rank */}
                    <td style={{ textAlign: 'center', padding: '12px 6px', verticalAlign: 'middle' }}>
                      {getRankBadge(rank)}
                    </td>

                    {/* Repairer Info */}
                    <td style={{ padding: '12px 8px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {rep.avatarUrl ? (
                          <img
                            src={rep.avatarUrl}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: '1px solid var(--line, #e5e7eb)',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--navy-soft, #f0f1f5)',
                              color: 'var(--navy-deep-text, #1e3a8a)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '12px',
                              border: '1px solid var(--line, #e5e7eb)',
                            }}
                          >
                            {initials}
                          </div>
                        )}
                        <div>
                          <Link
                            href={`/utilisateurs/${rep.repairerId}`}
                            style={{
                              fontWeight: 600,
                              fontSize: '14px',
                              color: 'var(--ink, #111827)',
                              textDecoration: 'none',
                            }}
                            className="hover:underline"
                          >
                            {rep.name}
                          </Link>
                          {rep.businessName && (
                            <p
                              style={{
                                margin: '1px 0 0',
                                fontSize: '12px',
                                color: 'var(--muted, #6b7280)',
                              }}
                            >
                              {rep.businessName}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* City / Location */}
                    <td style={{ padding: '12px 8px', fontSize: '13px', color: 'var(--muted, #4b5563)', verticalAlign: 'middle' }}>
                      {rep.city ?? 'France'}
                    </td>

                    {/* Offers Sent */}
                    <td style={{ textAlign: 'right', padding: '12px 8px', fontSize: '14px', color: 'var(--ink, #111827)', verticalAlign: 'middle' }}>
                      {formatCount(rep.offersSent)}
                    </td>

                    {/* Offers Accepted */}
                    <td style={{ textAlign: 'right', padding: '12px 8px', fontSize: '14px', color: 'var(--ink, #111827)', fontWeight: 600, verticalAlign: 'middle' }}>
                      {formatCount(rep.offersAccepted)}
                    </td>

                    {/* Conversion Rate */}
                    <td style={{ textAlign: 'right', padding: '12px 8px', verticalAlign: 'middle' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 'var(--r-pill, 999px)',
                          fontSize: '12px',
                          fontWeight: 700,
                          backgroundColor: badgeBg,
                          color: badgeColor,
                        }}
                      >
                        {formatPercentage(rep.acceptanceRate)}
                      </span>
                    </td>

                    {/* Revenue */}
                    <td style={{ textAlign: 'right', padding: '12px 8px', fontSize: '14px', fontWeight: 700, color: 'var(--ink, #111827)', verticalAlign: 'middle' }}>
                      {formatEuros(rep.totalRevenueCents)}
                    </td>

                    {/* Rating Badge */}
                    <td style={{ textAlign: 'right', padding: '12px 8px', verticalAlign: 'middle' }}>
                      {rep.rating !== null ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-pill, 999px)',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: 'var(--amber-soft, #fef7ec)',
                            color: 'var(--amber-deep, #92400e)',
                            border: '1px solid rgba(245, 158, 11, 0.25)',
                          }}
                        >
                          <span style={{ color: 'var(--badge-warning-text)' }}>★</span>
                          <span>{rep.rating.toFixed(1)}</span>
                          <span style={{ fontSize: '11px', opacity: 0.8 }}>({rep.reviewsCount})</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--muted, #9ca3af)' }}>
                          Sans avis
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
