// ============================================================
// lib/ledger.js — Pure ledger decision logic
// ============================================================
// The actual business rules behind postInvoiceEntry/postReceiptEntry/
// reverseEntries in lib/hooks.js, pulled out as plain functions with no
// React state, no Supabase, no side effects — so they can be unit tested
// directly. lib/hooks.js calls these to decide *what* to do, then performs
// the actual state updates / DB writes itself.
//
// This split exists because every ledger bug found so far (reverting a
// job's status silently dropping the amount, regenerating an unchanged
// document creating reversal noise) was really a bug in this decision
// logic, not in the React/Supabase plumbing around it.
import { revenueAccount } from './constants'

// Mirrors an entry's debit/credit accounts to produce the counter-entry
// that undoes it. Never deletes the original — the audit trail always
// shows both the original and its reversal.
export function buildReversalEntry(orig, userName) {
  return {
    date: new Date().toISOString(), type: 'reversal',
    description: `Reversal — ${orig.description}`,
    department: orig.department, job_id: orig.job_id, doc_number: orig.doc_number,
    debit_account: orig.credit_account, credit_account: orig.debit_account,
    amount: orig.amount, bank: orig.bank, created_by: userName || 'System', reverses_id: orig.id,
  }
}

// Which not-yet-reversed entries match a predicate, and the reversal rows
// needed to undo each of them.
export function planReversal(ledgerEntries, predicate, userName) {
  const targets = (ledgerEntries || []).filter(e => predicate(e) && !e.reversed)
  return {
    targetIds: targets.map(t => t.id),
    reversals: targets.map(orig => buildReversalEntry(orig, userName)),
  }
}

// The actual total an Invoice should post for — the amount shown on the
// generated PDF when one's given (delivery/discount already factored in),
// else the raw line-item sum, else the job's estimate.
export function computeInvoiceAmount(job, amountOverride) {
  if (amountOverride != null) return Number(amountOverride)
  const itemsTotal = (job.line_items || []).reduce((s, li) => s + ((Number(li.qty) || 0) * (Number(li.price) || 0)), 0)
  return itemsTotal || job.estimation_value || 0
}

// A Receipt has no line-item concept of its own — it's proof of payment
// against whatever was actually invoiced/estimated.
export function computeReceiptAmount(job, amountOverride) {
  if (amountOverride != null) return Number(amountOverride)
  return job.final_value || job.estimation_value || 0
}

// Decide what a document posting (Invoice or Receipt) should do:
//  - 'skip'      — nothing to post (amount is 0/falsy)
//  - 'unchanged' — an unreversed entry of this type already has this exact
//                  amount; reprinting/resharing shouldn't touch the ledger
//  - 'post'      — genuinely new or changed; reverse any prior entry of
//                  this type for the job, then post a fresh one
export function decideDocPosting(ledgerEntries, jobId, type, amount) {
  if (!amount) return 'skip'
  const existing = (ledgerEntries || []).find(e => e.job_id === jobId && e.type === type && !e.reversed)
  if (existing && Number(existing.amount) === amount) return 'unchanged'
  return 'post'
}

// Builds the actual Invoice ledger entry (Debit AR / Credit Revenue) —
// revenue is recognized when billed, not when collected (accrual, matching
// how the app's Finance page reports Outstanding/AR).
export function buildInvoiceEntry(job, docNumber, amount, userName) {
  return {
    date: new Date().toISOString(), type: 'invoice',
    description: `Invois ${docNumber} — ${job.customer_name || 'Customer'}`,
    department: job.department, job_id: job.job_id, doc_number: docNumber,
    debit_account: 'ar', credit_account: revenueAccount(job.department),
    amount, bank: null, created_by: userName || 'System',
  }
}

// Builds the actual Receipt ledger entry (Debit Bank / Credit AR) — clears
// what was owed, never touches revenue itself.
export function buildReceiptEntry(job, docNumber, amount, userName, bank) {
  return {
    date: new Date().toISOString(), type: 'receipt',
    description: `Resit ${docNumber} — ${job.customer_name || 'Customer'}`,
    department: job.department, job_id: job.job_id, doc_number: docNumber,
    debit_account: `bank_${bank}`, credit_account: 'ar',
    amount, bank, created_by: userName || 'System',
  }
}
