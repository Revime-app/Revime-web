'use client';

export interface PaymentsFilterBarProps {
  searchInput: string;
  onSearchInputChange: (val: string) => void;
  status: string;
  onStatusChange: (val: string) => void;
  step: string;
  onStepChange: (val: string) => void;
  delivery: string;
  onDeliveryChange: (val: string) => void;
  disputed: string;
  onDisputedChange: (val: string) => void;
  period?: string;
  onPeriodChange?: (val: string) => void;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}

export function PaymentsFilterBar({
  searchInput,
  onSearchInputChange,
  status,
  onStatusChange,
  step,
  onStepChange,
  delivery,
  onDeliveryChange,
  disputed,
  onDisputedChange,
  period,
  onPeriodChange,
  hasActiveFilters,
  onResetFilters,
}: PaymentsFilterBarProps) {
  return (
    <div
      className="filters"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        alignItems: 'center',
        marginBottom: '1.5rem',
        backgroundColor: 'var(--paper, #ffffff)',
        padding: '16px',
        borderRadius: 'var(--r-card, 10px)',
        border: '1px solid var(--line, #dfe2e2)',
      }}
    >
      <input
        type="search"
        value={searchInput}
        placeholder="Rechercher (ID commande, client, réparateur, Stripe...)"
        onChange={(e) => onSearchInputChange(e.target.value)}
        aria-label="Recherche paiements"
        style={{
          minWidth: '260px',
          flex: '1 1 240px',
          padding: '8px 12px',
          fontSize: '14px',
          borderRadius: 'var(--r-field, 4px)',
          border: '1px solid var(--line, #dfe2e2)',
        }}
      />

      {onPeriodChange && (
        <select
          value={period ?? 'all'}
          onChange={(e) => onPeriodChange(e.target.value)}
          aria-label="Filtrer par période"
          style={{
            padding: '8px 12px',
            fontSize: '14px',
            borderRadius: 'var(--r-field, 4px)',
            border: '1px solid var(--line, #dfe2e2)',
            backgroundColor: 'var(--paper)',
          }}
        >
          <option value="all">Tout l'historique</option>
          <option value="7d">7 derniers jours</option>
          <option value="30d">30 derniers jours</option>
          <option value="month">Ce mois-ci</option>
        </select>
      )}

      <select
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
        aria-label="Filtrer par statut"
        style={{
          padding: '8px 12px',
          fontSize: '14px',
          borderRadius: 'var(--r-field, 4px)',
          border: '1px solid var(--line, #dfe2e2)',
          backgroundColor: 'var(--paper)',
        }}
      >
        <option value="ALL">Tous les statuts</option>
        <option value="PAID">Payée</option>
        <option value="PENDING_PAYMENT">En attente de paiement</option>
        <option value="ABANDONED">Abandonnée</option>
        <option value="REFUNDED">Remboursée</option>
      </select>

      <select
        value={step}
        onChange={(e) => onStepChange(e.target.value)}
        aria-label="Filtrer par étape escrow"
        style={{
          padding: '8px 12px',
          fontSize: '14px',
          borderRadius: 'var(--r-field, 4px)',
          border: '1px solid var(--line, #dfe2e2)',
          backgroundColor: 'var(--paper)',
        }}
      >
        <option value="ALL">Toutes les étapes escrow</option>
        <option value="PAID">Paiement effectué</option>
        <option value="PARCEL_SENT">Colis envoyé</option>
        <option value="REPAIR_STARTED">Réparation en cours</option>
        <option value="REPAIR_DONE">Réparation terminée</option>
        <option value="AWAITING_VALIDATION">Validation client</option>
        <option value="RELEASED">Fonds débloqués</option>
      </select>

      <select
        value={delivery}
        onChange={(e) => onDeliveryChange(e.target.value)}
        aria-label="Filtrer par mode de livraison"
        style={{
          padding: '8px 12px',
          fontSize: '14px',
          borderRadius: 'var(--r-field, 4px)',
          border: '1px solid var(--line, #dfe2e2)',
          backgroundColor: 'var(--paper)',
        }}
      >
        <option value="ALL">Tous les modes</option>
        <option value="HOME">À domicile</option>
        <option value="WORKSHOP">En atelier</option>
        <option value="PARCEL">Par colis</option>
      </select>

      <select
        value={disputed}
        onChange={(e) => onDisputedChange(e.target.value)}
        aria-label="Filtrer par litige"
        style={{
          padding: '8px 12px',
          fontSize: '14px',
          borderRadius: 'var(--r-field, 4px)',
          border: '1px solid var(--line, #dfe2e2)',
          backgroundColor: 'var(--paper)',
        }}
      >
        <option value="ALL">Litiges : Tous</option>
        <option value="true">En litige</option>
        <option value="false">Sans litige</option>
      </select>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onResetFilters}
          style={{
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--muted, #6b7280)',
            backgroundColor: 'var(--badge-neutral-bg)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-field, 4px)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Réinitialiser les filtres
        </button>
      )}
    </div>
  );
}
