-- CF5-03. « REVIME — Support » could never post in a main conversation: the CHECK from
-- 20260825010000_message_kind allowed only USER-with-sender and SYSTEM-without, and
-- 20261001010000_disputes_spaces_push added 'SUPPORT' to "MessageKind" without widening it
-- (production: 23514 on every insert, 0 SUPPORT rows).
--
-- Drop and re-add under the same name, in Prisma's migration transaction. Every existing row
-- satisfies the wider rule, so the re-validation cannot fail. The 'SUPPORT' value was committed
-- by an earlier migration, so referencing it here is safe. No data change.

ALTER TABLE "Message" DROP CONSTRAINT "Message_kind_sender_consistent";

ALTER TABLE "Message" ADD CONSTRAINT "Message_kind_sender_consistent"
  CHECK (
    ("kind" = 'USER' AND "senderUserId" IS NOT NULL)
    OR ("kind" = 'SYSTEM' AND "senderUserId" IS NULL)
    OR ("kind" = 'SUPPORT' AND "senderUserId" IS NULL)
  );
