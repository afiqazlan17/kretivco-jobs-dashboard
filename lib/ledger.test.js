import { describe, it, expect } from 'vitest'
import {
  buildReversalEntry,
  planReversal,
  computeInvoiceAmount,
  computeReceiptAmount,
  decideDocPosting,
  buildInvoiceEntry,
  buildReceiptEntry,
} from './ledger'

const job = {
  job_id: 'KW-2026-001',
  department: 'work',
  customer_name: 'Test Customer',
  estimation_value: 500,
  final_value: 500,
  bank: 'mbb',
  line_items: [{ qty: 2, price: 50 }, { qty: 1, price: 100 }], // = 200
}

describe('buildReversalEntry', () => {
  it('swaps debit and credit, preserves amount, references the original', () => {
    const orig = { id: 'e1', description: 'Invois INV-001 — Test', department: 'work', job_id: 'KW-2026-001', doc_number: 'INV-001', debit_account: 'ar', credit_account: 'revenue_work', amount: 200, bank: null }
    const reversal = buildReversalEntry(orig, 'Afiq Azlan')
    expect(reversal.type).toBe('reversal')
    expect(reversal.debit_account).toBe('revenue_work') // swapped
    expect(reversal.credit_account).toBe('ar') // swapped
    expect(reversal.amount).toBe(200)
    expect(reversal.reverses_id).toBe('e1')
    expect(reversal.created_by).toBe('Afiq Azlan')
    expect(reversal.description).toContain('Reversal')
  })

  it('falls back to "System" when no user name is given', () => {
    const orig = { id: 'e1', description: 'x', debit_account: 'ar', credit_account: 'revenue_work', amount: 1 }
    expect(buildReversalEntry(orig).created_by).toBe('System')
  })
})

describe('planReversal', () => {
  it('only targets unreversed entries matching the predicate', () => {
    const entries = [
      { id: '1', job_id: 'KW-2026-001', type: 'invoice', reversed: false, description: 'a', debit_account: 'ar', credit_account: 'revenue_work', amount: 100 },
      { id: '2', job_id: 'KW-2026-001', type: 'invoice', reversed: true, description: 'b', debit_account: 'ar', credit_account: 'revenue_work', amount: 100 },
      { id: '3', job_id: 'KW-2026-002', type: 'invoice', reversed: false, description: 'c', debit_account: 'ar', credit_account: 'revenue_work', amount: 100 },
    ]
    const { targetIds, reversals } = planReversal(entries, e => e.job_id === 'KW-2026-001' && e.type === 'invoice', 'Afiq')
    expect(targetIds).toEqual(['1'])
    expect(reversals).toHaveLength(1)
    expect(reversals[0].reverses_id).toBe('1')
  })

  it('returns nothing to reverse when nothing matches', () => {
    const { targetIds, reversals } = planReversal([], () => true, 'Afiq')
    expect(targetIds).toEqual([])
    expect(reversals).toEqual([])
  })
})

describe('computeInvoiceAmount', () => {
  it('uses the override when given, even if 0', () => {
    expect(computeInvoiceAmount(job, 999)).toBe(999)
  })

  it('falls back to the line-item sum when no override', () => {
    expect(computeInvoiceAmount(job, null)).toBe(200) // 2*50 + 1*100
  })

  it('falls back to estimation_value when there are no line items', () => {
    expect(computeInvoiceAmount({ ...job, line_items: [] }, null)).toBe(500)
  })
})

describe('computeReceiptAmount', () => {
  it('uses the override when given', () => {
    expect(computeReceiptAmount(job, 777)).toBe(777)
  })

  it('falls back to final_value, then estimation_value', () => {
    expect(computeReceiptAmount(job, null)).toBe(500)
    expect(computeReceiptAmount({ ...job, final_value: null }, null)).toBe(500)
    expect(computeReceiptAmount({ ...job, final_value: null, estimation_value: null }, null)).toBe(0)
  })
})

describe('decideDocPosting — the exact bug fixed this session', () => {
  it('skips when the amount is falsy (nothing to post)', () => {
    expect(decideDocPosting([], 'KW-2026-001', 'invoice', 0)).toBe('skip')
  })

  it('posts when there is no existing entry yet', () => {
    expect(decideDocPosting([], 'KW-2026-001', 'invoice', 100)).toBe('post')
  })

  it('is unchanged when an unreversed entry already has this exact amount — regenerating/reprinting/re-sharing must not touch the ledger', () => {
    const entries = [{ job_id: 'KW-2026-001', type: 'invoice', reversed: false, amount: 100 }]
    expect(decideDocPosting(entries, 'KW-2026-001', 'invoice', 100)).toBe('unchanged')
  })

  it('posts (supersedes) when the amount genuinely differs from what is on the ledger', () => {
    const entries = [{ job_id: 'KW-2026-001', type: 'invoice', reversed: false, amount: 100 }]
    expect(decideDocPosting(entries, 'KW-2026-001', 'invoice', 200)).toBe('post')
  })

  it('ignores already-reversed entries — a superseded invoice does not block reposting', () => {
    const entries = [{ job_id: 'KW-2026-001', type: 'invoice', reversed: true, amount: 100 }]
    expect(decideDocPosting(entries, 'KW-2026-001', 'invoice', 100)).toBe('post')
  })

  it('keeps invoice and receipt independent for the same job', () => {
    const entries = [{ job_id: 'KW-2026-001', type: 'invoice', reversed: false, amount: 100 }]
    expect(decideDocPosting(entries, 'KW-2026-001', 'receipt', 100)).toBe('post')
  })

  it('keeps different jobs independent', () => {
    const entries = [{ job_id: 'KW-2026-001', type: 'invoice', reversed: false, amount: 100 }]
    expect(decideDocPosting(entries, 'KW-2026-999', 'invoice', 100)).toBe('post')
  })
})

describe('buildInvoiceEntry', () => {
  it('debits Accounts Receivable and credits the department revenue account', () => {
    const entry = buildInvoiceEntry(job, 'INV-2026-001', 200, 'Afiq Azlan')
    expect(entry.type).toBe('invoice')
    expect(entry.debit_account).toBe('ar')
    expect(entry.credit_account).toBe('revenue_work')
    expect(entry.amount).toBe(200)
    expect(entry.job_id).toBe('KW-2026-001')
    expect(entry.doc_number).toBe('INV-2026-001')
  })
})

describe('buildReceiptEntry', () => {
  it('debits the bank account and credits Accounts Receivable — never touches revenue', () => {
    const entry = buildReceiptEntry(job, 'RC-2026-001', 200, 'Afiq Azlan', 'mbb')
    expect(entry.type).toBe('receipt')
    expect(entry.debit_account).toBe('bank_mbb')
    expect(entry.credit_account).toBe('ar')
    expect(entry.amount).toBe(200)
    expect(entry.bank).toBe('mbb')
  })
})
