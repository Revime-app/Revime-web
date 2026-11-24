'use client';

import React from 'react';
import Link from 'next/link';
import { formatEuros, formatCount } from '../lib/money';
import { Trophy } from 'lucide-react';
import { Icon } from './Icon';
import { RankMedal } from './RankMedal';

export interface ReferralLeaderboardItem {
  id: string;
  name: string;
  email?: string | null;
  referralCode?: string | null;
  convertedCount: number;
  totalRewardsCents: number;
}

export interface ReferralLeaderboardCardProps {
  items?: ReferralLeaderboardItem[];
  loading?: boolean;
}

export function ReferralLeaderboardCard({
  items = [],
  loading = false,
}: ReferralLeaderboardCardProps) {
  return (
    <section
      className="card"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '20px 24px',
        marginBottom: '24px',
      }}
      aria-labelledby="referral-leaderboard-title"
    >
      <div style={{ marginBottom: '16px' }}>
        <h2
          id="referral-leaderboard-title"
          style={{
            fontSize: '16px',
            fontWeight: 600,
            margin: '0 0 6px 0',
            color: 'var(--ink, #141414)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span><Icon as={Trophy} /> Top Parrains & Ambassadeurs</span>
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
          Classement des utilisateurs générant le plus de conversions actives.
        </p>
      </div>

      {/* Explainer Box */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 'var(--r-field, 6px)',
          backgroundColor: 'var(--badge-info-bg)',
          border: '1px solid var(--badge-info-border)',
          fontSize: '12px',
          color: 'var(--navy-text, #25324f)',
          lineHeight: 1.45,
          marginBottom: '16px',
        }}
      >
        <strong>Programme de parrainage :</strong> 10€ offerts au filleul sur sa 1ère commande, 10€ offerts au parrain dès la livraison réussie.
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div
          style={{
            padding: '24px 16px',
            textAlign: 'center',
            color: 'var(--muted, #6b7280)',
            backgroundColor: 'var(--badge-neutral-bg)',
            borderRadius: 'var(--r-field, 6px)',
            border: '1px dashed var(--line, #dfe2e2)',
            fontSize: '13px',
          }}
        >
          {loading ? 'Chargement du classement…' : 'Aucune conversion de parrainage pour le moment.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--line, #dfe2e2)',
                  color: 'var(--muted, #6b7280)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <th style={{ padding: '8px 10px', width: '48px' }}>Rang</th>
                <th style={{ padding: '8px 10px' }}>Parrain</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Filleuls convertis</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Récompenses</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const rank = index + 1;
                const medal = rank <= 3 ? <RankMedal rank={rank} /> : `#${rank}`;
                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: '1px solid var(--line, #dfe2e2)',
                    }}
                  >
                    <td style={{ padding: '10px', fontWeight: 600, color: 'var(--ink, #141414)' }}>
                      {medal}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <Link
                        href={`/utilisateurs/${item.id}`}
                        style={{
                          color: 'var(--navy-text, #25324f)',
                          fontWeight: 600,
                          textDecoration: 'none',
                        }}
                      >
                        {item.name}
                      </Link>
                      {item.referralCode && (
                        <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)' }}>
                          Code : {item.referralCode}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>
                      {formatCount(item.convertedCount)}
                    </td>
                    <td
                      style={{
                        padding: '10px',
                        textAlign: 'right',
                        fontWeight: 600,
                        color: 'var(--badge-success-text)',
                      }}
                    >
                      {formatEuros(item.totalRewardsCents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
