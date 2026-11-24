import { describe, expect, it } from 'vitest';
import { contentIdFor, v1ContentCode } from '../src/shipping/content-codes.js';

describe('content codes', () => {
  it('maps the known slugs to Boxtal content ids, child first then root, default 50120', () => {
    expect(contentIdFor('smartphone', 'electronique')).toBe('content:v1:50113');
    expect(contentIdFor('ordinateur', 'electronique')).toBe('content:v1:50110');
    expect(contentIdFor('tablette', 'electronique')).toBe('content:v1:50110');
    expect(contentIdFor('televisions', 'electronique')).toBe('content:v1:80200');
    expect(contentIdFor('petit-electromenager', 'maison-jardin')).toBe('content:v1:60110');
    expect(contentIdFor('velos', 'mobilite')).toBe('content:v1:50120');
    expect(contentIdFor('unknown', null)).toBe('content:v1:50120');
  });

  it("v1's code_contenu is the numeric tail of the v3 id", () => {
    expect(v1ContentCode('content:v1:50113')).toBe('50113');
    expect(() => v1ContentCode('nonsense')).toThrow();
  });
});
