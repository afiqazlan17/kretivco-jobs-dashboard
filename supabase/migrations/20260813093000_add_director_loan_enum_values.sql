-- Director loan tracking: a director injects funds into the company
-- ('director_loan_in') or the company pays them back ('director_loan_repayment').
-- Posted against a per-director liability account (loan_<slug>) — see
-- lib/constants.js loanAccount() / lib/hooks.js postDirectorLoan().
ALTER TYPE ledger_entry_type_enum ADD VALUE IF NOT EXISTS 'director_loan_in';
ALTER TYPE ledger_entry_type_enum ADD VALUE IF NOT EXISTS 'director_loan_repayment';
