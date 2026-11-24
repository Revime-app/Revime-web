import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  autoReleaseDueFrom,
  canAdvance,
  cancellationPolicy,
  canRequestReleaseAfterTimeout,
  canValidate,
  disputePolicy,
  labelReady,
  nextStepFor,
  releaseRequestAvailableAt,
  STEP_LABEL,
  type CommandeDto,
} from '@revime/shared';
import { useTheme } from '../../theme';
import { Button } from '../Button';
import { useAdvanceStep, useReleaseCommande } from '../../lib/queries';
import { ApiError } from '../../lib/api';

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

type Props = {
  commandeId: string;
  data: CommandeDto;
};

/**
 * State-aware actions, extracted from `commande/[id].tsx` (Task 5): the réparateur's
 * next-step / release-request button, the client's « Valider la réparation », the
 * post-release confirmation, and the single « Laisser un avis » entry point.
 *
 * « Valider la réparation » is hidden while `data.disputeOpen` (spec §4.4 item 8,
 * CF4-14): funds stay with REVIME until the dispute resolves, so offering release
 * here would contradict the dispute banner shown above it.
 */
export function CommandeActions({ commandeId, data }: Props) {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const advance = useAdvanceStep(commandeId);
  const release = useReleaseCommande(commandeId);

  const role = data.viewerRole;
  const step = data.step;
  if (step === null) return null;

  const next = nextStepFor(step, data.delivery);
  const releaseRequestAvailableDate = releaseRequestAvailableAt(data);
  const autoReleaseDueDate = autoReleaseDueFrom(data.releaseRequestedAt);

  // CF4-27 (spec §4.3, §4.6). While a request is pending, every hand-advanced step and
  // « Valider » are frozen server-side (Task 5) - this mirrors that guard so the button is
  // never offered only to be refused. `?? null` at the boundary, per AGENTS.md's DTO rule:
  // an API older than this build sends no `cancellationRequest` field at all.
  const policy = cancellationPolicy(
    {
      status: data.status,
      step: data.step,
      transferred: data.status === 'PAID' && data.step === 'RELEASED',
      disputeOpen: data.disputeOpen,
      paymentUnderReview: data.paymentUnderReview,
      request: data.cancellationRequest ?? null,
    },
    role,
  );

  const dispPolicy = disputePolicy({
    status: data.status,
    releasedAt: data.releasedAt,
    dispute: data.dispute,
  });

  return (
    <>
      {!policy.frozen && data.status !== 'REFUNDED' && !data.paymentUnderReview && !data.disputeOpen && (
        <>
          {canAdvance(step, data.delivery, role) && next && labelReady(next, data) && (
            <Button
              label={
                next === 'AWAITING_VALIDATION'
                  ? 'Demander le déblocage des fonds'
                  : `Marquer « ${STEP_LABEL[next]} »`
              }
              onPress={() => advance.mutate({ step: next })}
              disabled={advance.isPending}
              loading={advance.isPending}
            />
          )}

          {role === 'REPAIRER' && step === 'RETURN_SENT' && !canRequestReleaseAfterTimeout(data, new Date()) && (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_500Medium',
                fontSize: 13,
                color: palette.muted,
                marginTop: spacing.md,
                textAlign: 'center',
              }}
            >
              En attente de confirmation du client
              {releaseRequestAvailableDate && (
                <>
                  {'\n'}
                  Vous pourrez demander le déblocage à partir du {formatDate(releaseRequestAvailableDate)}.
                </>
              )}
            </Text>
          )}

          {role === 'REPAIRER' && step === 'RETURN_SENT' && canRequestReleaseAfterTimeout(data, new Date()) && (
            <Button
              label="Demander le déblocage"
              onPress={() => advance.mutate({ step: 'AWAITING_VALIDATION' })}
              disabled={advance.isPending}
              loading={advance.isPending}
            />
          )}
        </>
      )}

      {role === 'REPAIRER' && step === 'AWAITING_VALIDATION' && !policy.frozen && !data.paymentUnderReview && data.status !== 'REFUNDED' && !data.disputeOpen && (
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_500Medium',
            fontSize: 13,
            color: palette.muted,
            marginTop: spacing.md,
            textAlign: 'center',
          }}
        >
          Déblocage demandé, en attente du client…
        </Text>
      )}

      {/* Same gate as the « Valider la réparation » block below. A refund leaves
          `step` where it was, so this promise of a validation to come would
          otherwise render under « Commande annulée ». */}
      {role === 'CLIENT' && step === 'REPAIR_DONE' && !policy.frozen && data.status !== 'REFUNDED' && !data.paymentUnderReview && !data.disputeOpen && (
        <View
          style={{
            backgroundColor: palette.greenSoft,
            borderWidth: 1,
            borderColor: '#cfe9d6',
            borderRadius: 14,
            padding: 14,
            marginTop: spacing.md,
          }}
        >
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_500Medium',
              fontSize: 12,
              lineHeight: 18,
              color: '#3a5a44',
            }}
          >
            Réparation terminée. Vous pourrez valider dès que le réparateur demande le déblocage des
            fonds.
          </Text>
        </View>
      )}

      {canValidate(step, role) && !policy.frozen && !data.paymentUnderReview && data.status !== 'REFUNDED' && !data.disputeOpen && (
        <>
          <Button
            label="Valider la réparation"
            onPress={() => release.mutate()}
            disabled={release.isPending}
            loading={release.isPending}
          />
          {dispPolicy.canOpen && (
            <View style={{ marginTop: spacing.sm }}>
              <Button
                label="Signaler un problème"
                variant="secondary"
                onPress={() => router.push(`/commande/${commandeId}/litige/nouveau`)}
              />
            </View>
          )}
          {autoReleaseDueDate && (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 12,
                color: palette.muted,
                marginTop: spacing.md,
                textAlign: 'center',
              }}
            >
              Sans action de votre part, les fonds seront débloqués le {formatDate(autoReleaseDueDate)}.
            </Text>
          )}
        </>
      )}

      {/* A post-release refund is spec §6.2's headline flow and produces
          `status: REFUNDED` with `step: RELEASED`, so without this gate the same
          screen says the payment was refunded in full AND that the funds went to
          the réparateur. The timeline label stays - that step did happen. */}
      {step === 'RELEASED' && data.status !== 'REFUNDED' && !data.paymentUnderReview && (
        <>
          {!(data.viewerRole === 'REPAIRER' && !data.hasStripeTransfer) && (
            <View
              style={{
                backgroundColor: palette.greenSoft,
                borderWidth: 1,
                borderColor: '#cfe9d6',
                borderRadius: 14,
                padding: 14,
                marginTop: spacing.md,
              }}
            >
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_500Medium',
                  fontSize: 12,
                  lineHeight: 18,
                  color: '#3a5a44',
                }}
              >
                Réparation validée. Les fonds ont été débloqués au réparateur. Merci !
              </Text>
            </View>
          )}

          {/* The ONLY entry point to LaisserAvis, and one rather than two on
              purpose. The prototype navigates to /avis straight after validating,
              which cannot serve auto-release: an auto-release has no mutation
              success to hang a navigation on. Here the release response seeds
              this screen's cache, the block renders, and the button is simply
              present. */}
          {data.viewerRole === 'CLIENT' && !data.reviewed && (
            <View style={{ marginTop: spacing.md }}>
              <Button
                label="Laisser un avis"
                onPress={() => router.push(`/avis/${commandeId}`)}
              />
            </View>
          )}
        </>
      )}

      {/* CF4-27 (spec §4.6). Secondary, so it never competes with the step button above it -
          `cancellationPolicy` already excludes every state where a step button would also
          show (RELEASED, transferred, disputed, REFUNDED, under review). */}
      {policy.canRequest && (
        <View style={{ marginTop: spacing.md }}>
          <Button
            label="Demander l'annulation"
            variant="secondary"
            onPress={() => router.push(`/commande/${commandeId}/annulation`)}
          />
        </View>
      )}

      {dispPolicy.canOpen &&
        !(
          canValidate(step, role) &&
          !policy.frozen &&
          !data.paymentUnderReview &&
          data.status !== 'REFUNDED' &&
          !data.disputeOpen
        ) && (
          <View style={{ marginTop: spacing.md }}>
            <Button
              label="Signaler un problème"
              variant="secondary"
              onPress={() => router.push(`/commande/${commandeId}/litige/nouveau`)}
            />
          </View>
        )}

      {(advance.error || release.error) && (
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_500Medium',
            fontSize: 13,
            color: palette.red,
            marginTop: spacing.md,
          }}
        >
          {advance.error instanceof ApiError
            ? advance.error.message
            : release.error instanceof ApiError
              ? release.error.message
              : 'Une erreur est survenue. Réessayez.'}
        </Text>
      )}
    </>
  );
}
