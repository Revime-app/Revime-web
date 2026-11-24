/**
 * Formats a location string for public/pre-payment display.
 * Pre-payment confidentiality rule (CF3-05):
 * Only postal code + city + distance may be shown before payment.
 * Street names, house numbers, and exact personal addresses are strictly stripped.
 */
export function formatPublicLocation(
  locationLabel: string | null | undefined,
  postalCode?: string | null,
): string {
  if (!locationLabel || locationLabel.trim() === '') {
    return postalCode ? postalCode.trim() : '';
  }

  const trimmed = locationLabel.trim();

  // 1. Matches French postal code + city at the end: e.g. "12 Rue de Rivoli 75001 Paris"
  const banMatch = trimmed.match(/\b(\d{5})\s+([^,]+)$/i);
  if (banMatch && banMatch[1] && banMatch[2]) {
    const pc = banMatch[1];
    const city = banMatch[2].trim();
    return `${pc} ${city}`;
  }

  // 2. If a valid 5-digit postal code is supplied and present in the label:
  if (postalCode && /^\d{5}$/.test(postalCode.trim())) {
    const pc = postalCode.trim();
    const idx = trimmed.indexOf(pc);
    if (idx !== -1) {
      const trailing = trimmed.slice(idx + pc.length).replace(/^[,\s-]+/, '').trim();
      if (trailing.length > 0) {
        return `${pc} ${trailing}`;
      }
    }
    // If the label is just a city name without street prefix numbers
    if (!/^\d+[\s,]/.test(trimmed)) {
      return trimmed.includes(pc) ? trimmed : `${pc} ${trimmed}`;
    }
    return pc;
  }

  // 3. If the string starts with a number and common French street indicator, strip the street part:
  const stripped = trimmed
    .replace(
      /^\d+[\w\s'’-]+(?:rue|av|avenue|bd|boulevard|allée|chemin|impasse|place|route|quai|cours|passage)\s+[^,0-9]+/i,
      '',
    )
    .replace(/^[,\s-]+/, '')
    .trim();

  if (stripped.length > 0 && stripped !== trimmed) {
    return stripped;
  }

  return trimmed;
}

/**
 * CF4-24 (spec §3 H1). What a BROWSING client sees of another client's location: the town
 * and nothing else - no street, and unlike `formatPublicLocation` above, no postcode either
 * (a bidder gets the postcode for his distance; a browsing client gets no reason to).
 * Empty when the label held nothing but a postcode.
 */
export function publicTownLabel(locationLabel: string | null | undefined): string {
  return formatPublicLocation(locationLabel, null)
    .replace(/\b\d{5}\b/g, '')
    .replace(/^[,\s-]+|[,\s-]+$/g, '')
    .replace(/\s{2,}/g, ' ');
}
