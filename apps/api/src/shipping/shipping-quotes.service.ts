import { Injectable } from '@nestjs/common';
import type { ParcelOption, ShipmentLeg, ShippingQuoteDto, ShippingQuoteOptionDto, ShippingQuoteRequest } from '@revime/shared';
import { grossUpForStripe, INSURABLE_VALUE_MAX_CENTS, splitShippingByLeg } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { GeocodeService } from '../geo/geocode.service.js';
import { arePaymentsEnabled } from '../payments/config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isShippingQuotesEnabled } from './config.js';
import { contentIdFor } from './content-codes.js';
import { shippingGateway, ShippingUnavailableError, type LegOffer, type Party } from './gateway.js';
import { selectLegOffer } from './selection.js';

export const QUOTE_TTL_MS = 30 * 60_000;

export const QUOTES_OFF = "Le devis de livraison n'est pas disponible.";
export const QUOTE_UNAVAILABLE = 'Devis de livraison indisponible pour le moment.';
export const NOT_SHIPPABLE = "Cet objet ne peut pas être expédié par colis.";
const PAYMENTS_OFF = "Le paiement n'est pas encore disponible.";
const OFFER_UNAVAILABLE = "Cette offre n'est plus disponible.";
const PARCEL_REFUSED = "Ce réparateur n'accepte pas l'envoi par colis.";
const NOT_FOUND = 'Ressource introuvable.';

/** Both legs of one carrier pair. */
export type LegPair = Record<ShipmentLeg, LegOffer>;

/**
 * What `ShippingQuote.legs` holds per option: the cheapest suitable pair, and the cheapest pair
 * whose BOTH legs can insure the declared value (spec « Amendment, 2026-09-04 » and its Task 10
 * addendum) - null when none can, or when the value exceeds the insurable cap. Task 13 orders the
 * legs of whichever pair the client paid for.
 */
export type QuoteLegPair = LegPair & { insured: LegPair | null };
export type QuoteLegs = Partial<Record<ParcelOption, QuoteLegPair>>;

/**
 * The pair the client PAID for - the insured variant when the row carries insurance, else the
 * uninsured cheapest - read off the quote the commande points at. Null for local orders, for
 * parcels paid under the manual driver, and for a quote with no pair for the paid option. Shared by
 * the label orders (`PaymentsService`) and the order's per-leg prices (V7 A9), so both read the
 * same pair.
 */
export function paidLegPair(commande: {
  delivery: string;
  parcelOption: ParcelOption | null;
  insuranceCents: number;
  shippingQuote: { legs: unknown } | null;
}): LegPair | null {
  if (commande.delivery !== 'PARCEL' || !commande.parcelOption || !commande.shippingQuote) return null;
  const option = (commande.shippingQuote.legs as QuoteLegs)[commande.parcelOption];
  if (!option) return null;
  return commande.insuranceCents > 0 ? option.insured : { OUTBOUND: option.OUTBOUND, RETURN: option.RETURN };
}

/** YYYY-MM-DD of the next Monday–Friday after `from`. Boxtal wants a collection date on a quote. */
export function nextWorkingDay(from: Date): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

type QuoteRow = {
  id: string;
  expiresAt: Date;
  legs: unknown;
  relayShippingCents: number | null;
  relayInsuredShippingCents: number | null;
  relayInsuranceCents: number | null;
  homeShippingCents: number | null;
  homeInsuredShippingCents: number | null;
  homeInsuranceCents: number | null;
};

@Injectable()
export class ShippingQuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocode: GeocodeService,
  ) {}

  /** Spec §7.1. Guards in the order the table lists them. */
  async quote(userId: string, offerId: string, input: ShippingQuoteRequest): Promise<ShippingQuoteDto> {
    if (!arePaymentsEnabled()) throw new AppException('UNPROCESSABLE_ENTITY', PAYMENTS_OFF);
    if (!isShippingQuotesEnabled()) throw new AppException('UNPROCESSABLE_ENTITY', QUOTES_OFF);

    const offer = await this.prisma.offer.findFirst({
      where: { id: offerId, deletedAt: null, demande: { authorUserId: userId, deletedAt: null } },
      select: {
        id: true,
        status: true,
        acceptsParcel: true,
        repairerUserId: true,
        demandeId: true,
        demande: { select: { status: true, postalCode: true, category: { select: { slug: true, parent: { select: { slug: true } } } } } },
        repairer: {
          select: {
            profile: { select: { verificationLevel: true, repairerSuspendedAt: true } },
            repairerProfile: { select: { postalCode: true } },
          },
        },
      },
    });
    if (!offer) throw new AppException('NOT_FOUND', NOT_FOUND);
    if (offer.status !== 'SENT' || offer.demande.status !== 'OPEN' || offer.repairer.profile?.repairerSuspendedAt) {
      throw new AppException('UNPROCESSABLE_ENTITY', OFFER_UNAVAILABLE);
    }
    if (!offer.acceptsParcel) throw new AppException('UNPROCESSABLE_ENTITY', PARCEL_REFUSED);

    const p = input.parcel;
    const existing = await this.prisma.shippingQuote.findFirst({
      where: {
        offerId: offer.id,
        clientUserId: userId,
        expiresAt: { gt: new Date() },
        commande: null,
        parcelWeightGrams: p.weightGrams,
        parcelLengthCm: p.lengthCm,
        parcelWidthCm: p.widthCm,
        parcelHeightCm: p.heightCm,
        parcelValueCents: p.valueCents,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return this.present(existing);

    const repairerPostal = offer.repairer.repairerProfile?.postalCode;
    if (!repairerPostal) throw new AppException('SERVICE_UNAVAILABLE', QUOTE_UNAVAILABLE);
    const [clientGeo, repairerGeo] = await Promise.all([
      this.geocode.lookupPostalCode(offer.demande.postalCode),
      this.geocode.lookupPostalCode(repairerPostal),
    ]);
    if (!clientGeo?.city || !repairerGeo?.city) throw new AppException('SERVICE_UNAVAILABLE', QUOTE_UNAVAILABLE);

    const client: Party = { postalCode: offer.demande.postalCode, city: clientGeo.city, kind: 'RESIDENTIAL' };
    const repairer: Party = {
      postalCode: repairerPostal,
      city: repairerGeo.city,
      kind: offer.repairer.profile?.verificationLevel === 'BUSINESS' ? 'BUSINESS' : 'RESIDENTIAL',
    };
    const contentId = contentIdFor(offer.demande.category.slug, offer.demande.category.parent?.slug ?? null);
    const takingOverDate = nextWorkingDay(new Date());

    let outbound: LegOffer[];
    let ret: LegOffer[];
    try {
      [outbound, ret] = await Promise.all([
        shippingGateway().quoteLeg({ leg: 'OUTBOUND', from: client, to: repairer, parcel: p, contentId, takingOverDate }),
        shippingGateway().quoteLeg({ leg: 'RETURN', from: repairer, to: client, parcel: p, contentId, takingOverDate }),
      ]);
    } catch (e) {
      if (e instanceof ShippingUnavailableError) throw new AppException('SERVICE_UNAVAILABLE', QUOTE_UNAVAILABLE);
      throw e;
    }

    const legs: QuoteLegs = {};
    const prices: Partial<Record<ParcelOption, { shippingCents: number; insuredShippingCents: number | null; insuranceCents: number | null }>> = {};
    const insurable = p.valueCents <= INSURABLE_VALUE_MAX_CENTS;
    for (const option of ['RELAY', 'HOME'] as const) {
      const o = selectLegOffer(outbound, option);
      const r = selectLegOffer(ret, option);
      if (!o || !r) continue;
      // The insured pair is selected SEPARATELY: the cheapest pair may not insure this value, and
      // Boxtal would silently accept `insured` on it while applying nothing.
      const oi = insurable ? selectLegOffer(outbound, option, { insured: true }) : null;
      const ri = insurable ? selectLegOffer(ret, option, { insured: true }) : null;
      const insured: LegPair | null = oi && ri ? { OUTBOUND: oi, RETURN: ri } : null;
      legs[option] = { OUTBOUND: o, RETURN: r, insured };
      prices[option] = {
        shippingCents: grossUpForStripe(o.costInclTaxCents + r.costInclTaxCents),
        insuredShippingCents: insured ? grossUpForStripe(insured.OUTBOUND.costInclTaxCents + insured.RETURN.costInclTaxCents) : null,
        insuranceCents: insured
          ? grossUpForStripe((insured.OUTBOUND.insuranceInclTaxCents ?? 0) + (insured.RETURN.insuranceInclTaxCents ?? 0))
          : null,
      };
    }
    if (!prices.RELAY && !prices.HOME) throw new AppException('UNPROCESSABLE_ENTITY', NOT_SHIPPABLE);

    const row = await this.prisma.shippingQuote.create({
      data: {
        offerId: offer.id,
        clientUserId: userId,
        parcelWeightGrams: p.weightGrams,
        parcelLengthCm: p.lengthCm,
        parcelWidthCm: p.widthCm,
        parcelHeightCm: p.heightCm,
        parcelValueCents: p.valueCents,
        relayShippingCents: prices.RELAY?.shippingCents ?? null,
        relayInsuredShippingCents: prices.RELAY?.insuredShippingCents ?? null,
        relayInsuranceCents: prices.RELAY?.insuranceCents ?? null,
        homeShippingCents: prices.HOME?.shippingCents ?? null,
        homeInsuredShippingCents: prices.HOME?.insuredShippingCents ?? null,
        homeInsuranceCents: prices.HOME?.insuranceCents ?? null,
        legs: legs as object,
        expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
      },
    });
    return this.present(row);
  }

  private present(row: QuoteRow): ShippingQuoteDto {
    const legs = row.legs as QuoteLegs;
    const labels = (pair: LegPair) => ({ OUTBOUND: pair.OUTBOUND.carrierLabel, RETURN: pair.RETURN.carrierLabel });
    const option = (
      pair: QuoteLegPair | undefined,
      shippingCents: number | null,
      insuredShippingCents: number | null,
      insuranceCents: number | null,
    ): ShippingQuoteOptionDto | undefined => {
      if (!pair || shippingCents === null) return undefined;
      // V7 A9: each price is split on its OWN pair, so the insured variant's legs name its carriers.
      const insured =
        pair.insured && insuredShippingCents !== null && insuranceCents !== null
          ? {
              shippingCents: insuredShippingCents,
              insuranceCents,
              carrierLabels: labels(pair.insured),
              legPrices: splitShippingByLeg(insuredShippingCents, pair.insured),
            }
          : null;
      return { shippingCents, carrierLabels: labels(pair), legPrices: splitShippingByLeg(shippingCents, pair), insured };
    };
    const options: ShippingQuoteDto['options'] = {};
    const relay = option(legs.RELAY, row.relayShippingCents, row.relayInsuredShippingCents, row.relayInsuranceCents);
    const home = option(legs.HOME, row.homeShippingCents, row.homeInsuredShippingCents, row.homeInsuranceCents);
    if (relay) options.RELAY = relay;
    if (home) options.HOME = home;
    return { id: row.id, expiresAt: row.expiresAt.toISOString(), options };
  }
}
