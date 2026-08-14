-- Bank Transfer: moving cash between the company's own bank accounts
-- (debit destination bank, credit source bank) — see
-- lib/hooks.js postBankTransfer().
ALTER TYPE ledger_entry_type_enum ADD VALUE IF NOT EXISTS 'bank_transfer';
