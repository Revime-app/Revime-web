-- RLS backfill after Supabase's 2026-10-31 security alert (rls_disabled_in_public, sensitive_columns_exposed).
-- Six tables shipped without the « ENABLE ROW LEVEL SECURITY, no policies » line every new table needs,
-- so the anon and authenticated PostgREST roles could read and write them. The API connects as postgres
-- (owner, BYPASSRLS), so it is unaffected.
-- Already applied by hand to the live DB on 2026-11-04 via the Supabase MCP; every statement here is
-- idempotent, so `migrate deploy` re-running them at the next push is a no-op.

ALTER TABLE "CancellationRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "twoFactor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Dispute" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DisputeMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsentProof" ENABLE ROW LEVEL SECURITY;

-- function_search_path_mutable: the trigger body references no tables, so an empty search_path is safe.
ALTER FUNCTION prevent_consent_proof_mutation() SET search_path = '';
