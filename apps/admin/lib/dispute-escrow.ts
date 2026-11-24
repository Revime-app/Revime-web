const SETTLED = ['RESOLVED_REFUNDED', 'RESOLVED_RELEASED', 'RESOLVED_DISMISSED'];

/**
 * P19. The order total is only « bloqué sous séquestre » while the dispute is open on an order
 * that is still paid: once the dispute is closed or the order refunded the money has moved (or is
 * free to), and a card saying « Total bloqué » would be false.
 */
export function escrowCard(input: { disputeStatus: string; commandeStatus: string }): {
  title: string;
  caption: string;
} {
  const settled = SETTLED.includes(input.disputeStatus) || input.commandeStatus === 'REFUNDED';
  return settled
    ? { title: 'Total de la commande', caption: 'Litige clos' }
    : { title: 'Total bloqué', caption: 'Sur compte séquestre' };
}
