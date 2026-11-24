import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSION_KEY } from '../src/admin/require-permission.decorator.js';
import { AUDIT_KEY } from '../src/admin/admin-audit.decorator.js';
import { AdminController } from '../src/admin/admin.controller.js';

/**
 * CF6-19: « any administrative actions must be logged ». The interceptor audits whatever carries
 * `@Audit`, so the guarantee lives in the metadata of the two compliance routes. The lockstep
 * coverage specs only cover write handlers, which is why this one reads the metadata directly.
 */
describe('compliance routes: audit and permission metadata', () => {
  const meta = (key: string, handler: keyof AdminController) =>
    Reflect.getMetadata(key, AdminController.prototype[handler] as object);

  it('audits every verification against the proof id', () => {
    expect(meta(AUDIT_KEY, 'verifyComplianceProof')).toMatchObject({
      action: 'compliance.proof_verify',
      targetType: 'ConsentProof',
      targetParam: 'id',
    });
  });

  it('audits listing too, because each row carries an e-mail, an IP address and a user agent', () => {
    expect(meta(AUDIT_KEY, 'listComplianceProofs')).toMatchObject({
      action: 'compliance.proofs_view',
      targetType: 'ConsentProof',
    });
  });

  it('gates both behind compliance.read', () => {
    expect(meta(PERMISSION_KEY, 'listComplianceProofs')).toBe('compliance.read');
    expect(meta(PERMISSION_KEY, 'verifyComplianceProof')).toBe('compliance.read');
  });
});
