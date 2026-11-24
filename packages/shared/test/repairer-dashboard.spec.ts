import { describe, expect, it } from 'vitest';
import {
  repairerDashboardSchema,
  todoBadgeCount,
  type DashboardTodoItem,
} from '../src/repairer-dashboard.js';

describe('repairerDashboardSchema (CF5-15)', () => {
  const baseTodo: DashboardTodoItem[] = [
    { kind: 'DISPUTE', count: 1, commandeId: 'cmd-1', awaitingReply: 1 },
    { kind: 'ATTENTION', count: 2, commandeId: null },
    { kind: 'QUOTE_REQUESTS', count: 3 },
  ];

  it('calculates total todoBadgeCount correctly', () => {
    expect(todoBadgeCount(baseTodo)).toBe(6);
  });

  it('calculates todoBadgeCount with CATEGORIES_MISSING as 1', () => {
    expect(todoBadgeCount([{ kind: 'CATEGORIES_MISSING' }])).toBe(1);
  });

  it('parses dashboard payload with unseenTodoCount and todoSeenAt', () => {
    const payload = {
      todo: baseTodo,
      activity: [],
      unseenTodoCount: 0,
      todoSeenAt: '2026-10-04T00:00:00.000Z',
    };
    const parsed = repairerDashboardSchema.parse(payload);
    expect(parsed.unseenTodoCount).toBe(0);
    expect(parsed.todoSeenAt).toBe('2026-10-04T00:00:00.000Z');
  });

  it('accepts payload without unseenTodoCount for backward compatibility', () => {
    const payload = {
      todo: baseTodo,
      activity: [],
    };
    const parsed = repairerDashboardSchema.parse(payload);
    expect(parsed.unseenTodoCount).toBeUndefined();
    expect(parsed.todoSeenAt).toBeUndefined();
  });

  it('rejects invalid unseenTodoCount values', () => {
    expect(() =>
      repairerDashboardSchema.parse({
        todo: baseTodo,
        activity: [],
        unseenTodoCount: -1,
      }),
    ).toThrow();

    expect(() =>
      repairerDashboardSchema.parse({
        todo: baseTodo,
        activity: [],
        unseenTodoCount: 1.5,
      }),
    ).toThrow();
  });
});
