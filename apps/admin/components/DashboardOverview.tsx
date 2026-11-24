import { kpiUnavailable, type AdminOverview } from '@revime/shared';

/**
 * V8 E1: an API older than this dashboard omits the setup figures. `KpiTile` reads `value.kind`, so an absent figure
 * is passed as unavailable, never as `undefined`.
 */
const SETUP_UNAVAILABLE = kpiUnavailable('Non disponible');
import { KpiGroup } from './KpiGroup';
import { KpiTile } from './KpiTile';
import { PendingActionsBlock } from './PendingActionsBlock';
import { DashboardMiniCharts } from './DashboardMiniCharts';
import { RecentActions } from './RecentActions';

/** The loaded dashboard, apart from the page's fetch so that a spec can render it with a fixture. */
export function DashboardOverview({ o }: { o: AdminOverview }) {
  return (
    <>
      {(() => {
        // Three possible banner segments, each shown only when applicable
        const segments: string[] = [];
        if (o.context.demoAccounts > 0) {
          segments.push(`${o.context.demoAccounts} comptes de démonstration inclus`);
        }
        if (o.context.testFixtureAccounts > 0) {
          segments.push(`${o.context.testFixtureAccounts} comptes de test (suite d'intégration)`);
        }
        if (o.context.stripeTestMode) {
          segments.push('paiements en mode test');
        }
        return segments.length > 0 ? (
          <p className="banner">{segments.join(' · ')}</p>
        ) : null;
      })()}

      <PendingActionsBlock actions={o.pendingActions} />

      <KpiGroup title="Utilisateurs">
        <KpiTile label="Total" value={o.users.total} href="/utilisateurs" />
        <KpiTile
          label={`Nouveaux (${o.context.recentWindowDays} j)`}
          value={o.users.recent}
          href="/utilisateurs"
        />
        <KpiTile
          label="Comptes actifs"
          value={o.users.active}
          note="Session en cours de validité"
          href="/utilisateurs?statut=actif"
        />
        <KpiTile label="Comptes suspendus" value={o.users.suspended} href="/utilisateurs?statut=suspendu" />
      </KpiGroup>

      <KpiGroup title="Réparateurs">
        <KpiTile label="Inscrits" value={o.repairers.total} href="/utilisateurs?type=reparateur" />
        {/* V8 E1 (criterion 8). No href: no list filter exists for them. */}
        <KpiTile label="Configuration terminée" value={o.repairers.setupComplete ?? SETUP_UNAVAILABLE} />
        <KpiTile label="Configuration en cours" value={o.repairers.setupIncomplete ?? SETUP_UNAVAILABLE} />
        <KpiTile label="Vérifiés" value={o.repairers.verified} href="/utilisateurs?type=reparateur&niveau=IDENTITY" />
        <KpiTile label="Vérifications en attente" value={o.repairers.pendingVerification} href="/verifications?needsAction=true" />
        <KpiTile label="Suspendus" value={o.repairers.suspended} href="/utilisateurs?type=reparateur&statut=suspendu" />
      </KpiGroup>

      <KpiGroup title="Demandes">
        <KpiTile label="Publiées" value={o.demandes.published} href="/demandes?etat=visible" />
        <KpiTile label="En cours" value={o.demandes.inProgress} href="/demandes?statut=en_cours" />
        <KpiTile label="Terminées" value={o.demandes.done} href="/demandes?statut=terminee" />
      </KpiGroup>

      <KpiGroup title="Offres">
        <KpiTile label="Envoyées" value={o.offers.sent} href="/offres" />
        <KpiTile label="Acceptées" value={o.offers.accepted} href="/offres?status=accepted" />
        {/* « Non retenues » is the label the Offres list gives the REJECTED status: one state, one tile. */}
        <KpiTile label="Non retenues" value={o.offers.rejected} href="/offres?status=REJECTED" />
        <KpiTile label="Retirées" value={o.offers.withdrawn} href="/offres?status=withdrawn" />
      </KpiGroup>

      <KpiGroup title="Paiements">
        <KpiTile label="Volume des transactions" value={o.payments.volumeCents} money href="/paiements" />
        <KpiTile label="Commissions générées" value={o.payments.commissionCents} money href="/paiements" />
        <KpiTile label="Paiements en attente" value={o.payments.pending} href="/paiements?status=pending" badWhenUp />
        <KpiTile label="Remboursements" value={o.payments.refunded} href="/remboursements" badWhenUp />
      </KpiGroup>

      <KpiGroup title="Litiges">
        <KpiTile label="Ouverts" value={o.disputes.open} href="/litiges?status=OPEN" badWhenUp />
        <KpiTile label="En cours de traitement" value={o.disputes.inReview} href="/litiges?status=IN_REVIEW" badWhenUp />
        <KpiTile label="Clôturés" value={o.disputes.closed} href="/litiges?status=RESOLVED" />
      </KpiGroup>

      <DashboardMiniCharts trends={o.trends30d} />

      <section className="group">
        <h2 className="group__title">Dernières actions</h2>
        <div className="card">
          <RecentActions />
        </div>
      </section>
    </>
  );
}
