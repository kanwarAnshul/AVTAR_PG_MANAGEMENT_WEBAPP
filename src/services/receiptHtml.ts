import { formatCurrency, formatDate, getBillingPeriodLabel } from '../utils/helpers';

/** Shared, platform-independent receipt markup. */
export interface ReceiptData {
  payment?: any;
  invoice?: any;
  tenant?: any;
  propertyName?: string;
  collectedBy?: string;
}

const esc = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const money = (paise: unknown): string =>
  typeof paise === 'number' ? formatCurrency(paise) : '—';

export const buildReceiptHtml = (data: ReceiptData): string => {
  const { payment = {}, invoice = {}, tenant = {}, propertyName, collectedBy } = data;
  const receiptNo = payment.receipt_no || `RCP-${Date.now()}`;
  const paymentDate = payment.payment_date
    ? formatDate(payment.payment_date)
    : formatDate(new Date().toISOString());
  const period = invoice.billing_period ? getBillingPeriodLabel(invoice.billing_period) : '—';
  const amount = money(payment.amount ?? invoice.paid_amount);
  const mode = payment.mode ? String(payment.mode).toUpperCase() : '—';
  const reference = payment.reference_no || '—';
  const room =
    tenant.room?.room_no ||
    tenant.current_tenancy?.[0]?.room?.room_no ||
    tenant.tenancy?.[0]?.room?.room_no;
  const bed =
    tenant.bed?.label ||
    tenant.current_tenancy?.[0]?.bed?.label ||
    tenant.tenancy?.[0]?.bed?.label;
  const accommodation = room || bed ? `${room ? `Room ${esc(room)}` : ''}${room && bed ? ' · ' : ''}${bed ? `Bed ${esc(bed)}` : ''}` : '—';
  const total = money(invoice.total_amount);
  const balance = money(invoice.balance_due ?? 0);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    @page { margin: 18px; }
    body { font-family: Helvetica, Arial, sans-serif; color: #1c2116; padding: 24px; }
    .header { text-align: center; border-bottom: 3px solid #4F5E28; padding-bottom: 14px; margin-bottom: 20px; }
    .brand { font-size: 26px; font-weight: bold; color: #4F5E28; letter-spacing: 1px; }
    .sub { font-size: 12px; color: #5C6450; margin-top: 4px; }
    .title { font-size: 16px; font-weight: bold; color: #B45309; margin-top: 10px; letter-spacing: 2px; }
    .meta { width: 100%; margin-bottom: 16px; }
    .meta td { padding: 5px 0; font-size: 13px; }
    .meta .label { color: #6B7280; }
    .box { border: 1px solid #DCE1CC; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; background: #FAFBF6; }
    .box h3 { margin: 0 0 10px; font-size: 12px; color: #4F5E28; letter-spacing: 1px; }
    table.lines { width: 100%; border-collapse: collapse; }
    table.lines th, table.lines td { border-bottom: 1px solid #E5E9D9; padding: 9px 6px; text-align: left; font-size: 13px; }
    table.lines th { color: #6B7280; font-size: 11px; letter-spacing: 1px; }
    .amount { text-align: right; font-weight: bold; }
    .total { background: #EFF1E6; font-weight: bold; }
    .thanks { margin-top: 22px; font-size: 13px; }
    .sign { margin-top: 46px; border-top: 1px solid #9CA38B; padding-top: 8px; font-size: 12px; color: #5C6450; }
    .footer { margin-top: 26px; text-align: center; font-size: 10px; color: #7A806F; line-height: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">AVTAR SINGH PG</div>
    <div class="sub">Gurgaon, Haryana · avtar.singh@avtarpg.com</div>
    <div class="title">RENT PAYMENT RECEIPT</div>
  </div>

  <table class="meta">
    <tr>
      <td class="label">Receipt No.</td><td><strong>${esc(receiptNo)}</strong></td>
      <td class="label">Payment Date</td><td><strong>${esc(paymentDate)}</strong></td>
    </tr>
    <tr>
      <td class="label">Tenant</td><td><strong>${esc(tenant.full_name)}</strong></td>
      <td class="label">Property</td><td><strong>${esc(propertyName)}</strong></td>
    </tr>
    <tr>
      <td class="label">Accommodation</td><td>${accommodation}</td>
      <td class="label">Billing Period</td><td>${esc(period)}</td>
    </tr>
    <tr>
      <td class="label">Invoice No.</td><td>${esc(invoice.invoice_no)}</td>
      <td class="label">Payment Mode</td><td>${esc(mode)}</td>
    </tr>
    <tr>
      <td class="label">Reference</td><td>${esc(reference)}</td>
      <td class="label">Collected By</td><td>${esc(collectedBy || 'Office')}</td>
    </tr>
  </table>

  <div class="box">
    <h3>PAYMENT SUMMARY</h3>
    <table class="lines">
      <thead><tr><th>Particulars</th><th class="amount">Amount</th></tr></thead>
      <tbody>
        <tr><td>Rent for ${esc(period)}</td><td class="amount">${total}</td></tr>
        <tr class="total"><td>Amount Received</td><td class="amount">${amount}</td></tr>
        <tr><td>Balance After Payment</td><td class="amount">${balance}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="thanks"><strong>Received with thanks.</strong> Thank you for your prompt payment.</div>
  <div class="sign">For AVTAR SINGH PG Management &nbsp;&nbsp;.............................................</div>
  <div class="footer">
    This is a computer-generated receipt from the AVTAR SINGH PG Manager app.<br />
    For queries about this receipt, contact the owner office at avtar.singh@avtarpg.com.
  </div>
</body>
</html>`;
};
