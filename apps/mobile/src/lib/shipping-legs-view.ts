import { euros, type ShipmentLeg, type ShippingLegPrices } from '@revime/shared';

/**
 * V7 A9 (U8, `DEC7-23`). The client asked to see the outbound and the return delivery price
 * separately, each with its carrier, « pour que le client comprenne le total ». The server sends the
 * split (`splitShippingByLeg`: the shown total in proportion to each leg's cost, so the two add up
 * to it). These helpers turn it into the lines five surfaces draw, and fall back to the single line
 * each surface had when there is no split (Q6): an order with no quote, or an API older than U8.
 */

export type DeliveryRow = { label: string; value: string };

const LEG_ORDER: ShipmentLeg[] = ['OUTBOUND', 'RETURN'];
const LEG_LOWER: Record<ShipmentLeg, string> = { OUTBOUND: 'aller', RETURN: 'retour' };
const LEG_TITLE: Record<ShipmentLeg, string> = { OUTBOUND: 'Aller', RETURN: 'Retour' };

/**
 * The split, or null when there is none or it does not add up to the total it would sit beside.
 * The second case should not happen (the server derives both from one figure), but two legs that
 * contradict the total printed under them would be worse than the one line they replace.
 */
function usable(totalCents: number, legs: ShippingLegPrices | null | undefined): ShippingLegPrices | null {
  if (!legs) return null;
  return legs.OUTBOUND.cents + legs.RETURN.cents === totalCents ? legs : null;
}

/**
 * The payment summary, the receipt and « Détails du paiement » (Q4): « Livraison aller · Chronopost »
 * and « Livraison retour · … » in place of the one row, or that row as it was.
 */
export function deliveryRows(totalCents: number, legs: ShippingLegPrices | null | undefined, singleLabel: string): DeliveryRow[] {
  const split = usable(totalCents, legs);
  if (!split) return [{ label: singleLabel, value: euros(totalCents) }];
  return LEG_ORDER.map((leg) => ({
    label: `Livraison ${LEG_LOWER[leg]} · ${split[leg].carrierLabel}`,
    value: euros(split[leg].cents),
  }));
}

/**
 * A « Point relais » / « À domicile » row of the payment step (Q4): one line per leg under the
 * option's name, its total staying on the right. Null keeps the old « aller-retour · … » line.
 */
export function optionLegLines(pair: { shippingCents: number; legPrices?: ShippingLegPrices }): string[] | null {
  const split = usable(pair.shippingCents, pair.legPrices);
  if (!split) return null;
  return LEG_ORDER.map((leg) => `${LEG_TITLE[leg]} · ${split[leg].carrierLabel} · ${euros(split[leg].cents)}`);
}

/** The order's « Livraison » card (Q4): an « Aller » and a « Retour » row under « Mode de livraison », or nothing. */
export function deliveryCardLegRows(legs: ShippingLegPrices | null | undefined): DeliveryRow[] {
  if (!legs) return [];
  return LEG_ORDER.map((leg) => ({
    label: LEG_TITLE[leg],
    value: `${legs[leg].carrierLabel} · ${euros(legs[leg].cents)}`,
  }));
}
