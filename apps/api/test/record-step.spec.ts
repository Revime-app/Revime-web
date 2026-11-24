import { describe, expect, it, vi } from 'vitest';
import { recordStep } from '../src/commandes/record-step.js';

describe('recordStep', () => {
  it('creates one CommandeStepEvent row for the given commande and step', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const tx = { commandeStepEvent: { create } };

    await recordStep(tx, 'c1', 'REPAIR_STARTED');

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: { commandeId: 'c1', step: 'REPAIR_STARTED' },
    });
  });

  it('does not swallow a rejection from create', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    const tx = { commandeStepEvent: { create } };

    await expect(recordStep(tx, 'c1', 'PAID')).rejects.toThrow('db down');
  });
});
