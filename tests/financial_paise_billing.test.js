const { describe, it } = require('node:test');
const assert = require('node:assert');

/**
 * FINANCIAL & BILLING INTEGRITY TEST
 * 1. Validates INTEGER paise storage (1 INR = 100 paise) to prevent float inaccuracies.
 * 2. Emulates the trigger update_invoice_balance() and FIFO payment allocations.
 * 3. Tests generate_monthly_bills() idempotency (ON CONFLICT DO NOTHING).
 */

describe('Financial Math & Paise Precision', () => {
  it('should eliminate floating point inaccuracies across multiple decimal additions', () => {
    // Classic JavaScript float problem: 0.1 + 0.2 !== 0.3
    // In INR float: 10.10 + 20.20 = 30.299999999999997
    const floatSum = 10.10 + 20.20;
    assert.notStrictEqual(floatSum, 30.30, 'Float calculation exhibits IEEE 754 drift');

    // In Paise integer:
    const paiseA = 1010; // ₹10.10
    const paiseB = 2020; // ₹20.20
    const paiseSum = paiseA + paiseB; // 3030 paise exactly
    assert.strictEqual(paiseSum, 3030);
    assert.strictEqual(paiseSum / 100, 30.3);
  });

  it('should correctly format currency in INR style', () => {
    const formatCurrency = (paise) => {
      const rupees = paise / 100;
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(rupees);
    };

    const formatted = formatCurrency(850000); // ₹8,500
    assert.ok(formatted.includes('8,500') || formatted.includes('8500'));
  });
});

describe('FIFO Payment Allocation & Invoice Balance Trigger', () => {
  function processFifoPayment(invoices, paymentAmountPaise) {
    let remainingPayment = paymentAmountPaise;
    const allocations = [];

    // Sort unpaid/partial invoices by due date ascending
    const sorted = [...invoices].sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    for (const inv of sorted) {
      if (remainingPayment <= 0) break;
      if (inv.balance_due <= 0) continue;

      const allocAmount = Math.min(inv.balance_due, remainingPayment);
      inv.paid_amount += allocAmount;
      inv.balance_due -= allocAmount;
      remainingPayment -= allocAmount;

      inv.status = inv.balance_due === 0 ? 'paid' : 'partial';
      allocations.push({
        invoice_id: inv.id,
        amount: allocAmount,
      });
    }

    return { allocations, remainingPayment };
  }

  it('should accurately distribute a ₹15,000 payment across an ₹8,000 overdue invoice and an ₹8,000 current invoice', () => {
    const invoices = [
      { id: 'inv-1', billing_period: '2026-01', total_amount: 800000, paid_amount: 0, balance_due: 800000, due_date: '2026-01-05', status: 'overdue' },
      { id: 'inv-2', billing_period: '2026-02', total_amount: 800000, paid_amount: 0, balance_due: 800000, due_date: '2026-02-05', status: 'sent' },
    ];

    const paymentAmount = 1500000; // ₹15,000 in paise
    const result = processFifoPayment(invoices, paymentAmount);

    assert.strictEqual(result.allocations.length, 2);
    // Invoice 1 should be fully paid (₹8,000)
    assert.strictEqual(invoices[0].paid_amount, 800000);
    assert.strictEqual(invoices[0].balance_due, 0);
    assert.strictEqual(invoices[0].status, 'paid');

    // Invoice 2 should have ₹7,000 paid and ₹1,000 remaining
    assert.strictEqual(invoices[1].paid_amount, 700000);
    assert.strictEqual(invoices[1].balance_due, 100000);
    assert.strictEqual(invoices[1].status, 'partial');

    // Remaining unused payment should be 0
    assert.strictEqual(result.remainingPayment, 0);
  });
});

describe('Idempotent Monthly Billing Procedure', () => {
  it('should never create duplicate invoices when run multiple times for the same month', () => {
    const dbInvoices = new Map(); // key: `${tenancy_id}:${billing_period}`
    const tenancies = [
      { id: 't-1', tenant_id: 'tn-1', monthly_rent: 800000, status: 'active' },
      { id: 't-2', tenant_id: 'tn-2', monthly_rent: 950000, status: 'active' },
      { id: 't-3', tenant_id: 'tn-3', monthly_rent: 800000, status: 'checked_out' }, // inactive
    ];

    function generateMonthlyBills(billingPeriod, createdBy) {
      let createdCount = 0;
      for (const t of tenancies) {
        if (t.status !== 'active') continue;
        const key = `${t.id}:${billingPeriod}`;

        // Emulates ON CONFLICT (tenancy_id, billing_period) DO NOTHING
        if (!dbInvoices.has(key)) {
          dbInvoices.set(key, {
            id: `inv-${t.id}-${billingPeriod}`,
            tenancy_id: t.id,
            billing_period: billingPeriod,
            total_amount: t.monthly_rent,
            balance_due: t.monthly_rent,
            status: 'sent',
            created_by: createdBy,
          });
          createdCount++;
        }
      }
      return createdCount;
    }

    // 1st run for 2026-03: creates 2 invoices (only for active tenancies)
    const count1 = generateMonthlyBills('2026-03', 'owner-01');
    assert.strictEqual(count1, 2);
    assert.strictEqual(dbInvoices.size, 2);

    // 2nd run for 2026-03 (accidental double tap): creates 0 invoices
    const count2 = generateMonthlyBills('2026-03', 'owner-01');
    assert.strictEqual(count2, 0);
    assert.strictEqual(dbInvoices.size, 2);

    // 3rd run for 2026-04: creates 2 invoices for new month
    const count3 = generateMonthlyBills('2026-04', 'owner-01');
    assert.strictEqual(count3, 2);
    assert.strictEqual(dbInvoices.size, 4);
  });
});

