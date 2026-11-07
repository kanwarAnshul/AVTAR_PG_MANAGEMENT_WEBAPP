// ============================================================
// Utility Helpers
// ============================================================

import { format, formatDistanceToNow, parseISO } from 'date-fns';

// Currency
export const paiseToRupees = (paise: number): number => paise / 100;
export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

export const formatCurrency = (paise: number, compact = false): string => {
  const rupees = paise / 100;
  if (compact) {
    if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
    if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}k`;
    return `₹${rupees}`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupees);
};

// Dates
export const formatDate = (dateStr: string, fmt = 'dd MMM yyyy'): string => {
  try {
    return format(parseISO(dateStr), fmt);
  } catch {
    return dateStr;
  }
};

export const formatRelativeTime = (dateStr: string): string => {
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
};

export const getBillingPeriodLabel = (period: string): string => {
  try {
    const [year, month] = period.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return format(date, 'MMMM yyyy');
  } catch {
    return period;
  }
};

// PAN Validation
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const validatePAN = (pan: string): boolean => PAN_REGEX.test(pan.toUpperCase());

// Phone validation
export const PHONE_REGEX = /^[6-9]\d{9}$/;
export const validatePhone = (phone: string): boolean => PHONE_REGEX.test(phone);

// CSV Injection Guard
export const sanitizeForCsv = (value: string): string => {
  if (typeof value !== 'string') return String(value);
  // Strip formula injection chars
  return value.replace(/^[=+\-@\t\r]/, '');
};

// Generate receipt number
export const generateReceiptNo = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `RCP-${timestamp}-${random}`;
};

// Occupancy percentage
export const occupancyPercent = (occupied: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((occupied / total) * 100);
};

// Status colors
export const getStatusColor = (status: string): { bg: string; text: string } => {
  const map: Record<string, { bg: string; text: string }> = {
    pending:     { bg: '#FEF3C7', text: '#92400E' },
    approved:    { bg: '#DCFCE7', text: '#166534' },
    rejected:    { bg: '#FEE2E2', text: '#991B1B' },
    resubmission:{ bg: '#E0F2FE', text: '#075985' },
    open:        { bg: '#FEF3C7', text: '#92400E' },
    in_progress: { bg: '#DBEAFE', text: '#1E40AF' },
    resolved:    { bg: '#DCFCE7', text: '#166534' },
    closed:      { bg: '#F3F4F6', text: '#374151' },
    available:   { bg: '#DCFCE7', text: '#166534' },
    occupied:    { bg: '#FEE2E2', text: '#991B1B' },
    maintenance: { bg: '#FEF3C7', text: '#92400E' },
    paid:        { bg: '#DCFCE7', text: '#166534' },
    partial:     { bg: '#FEF3C7', text: '#92400E' },
    overdue:     { bg: '#FEE2E2', text: '#991B1B' },
    draft:       { bg: '#F3F4F6', text: '#374151' },
    sent:        { bg: '#DBEAFE', text: '#1E40AF' },
    active:      { bg: '#DCFCE7', text: '#166534' },
    checked_out: { bg: '#F3F4F6', text: '#374151' },
    low:         { bg: '#DCFCE7', text: '#166534' },
    medium:      { bg: '#FEF3C7', text: '#92400E' },
    high:        { bg: '#FFEDD5', text: '#9A3412' },
    urgent:      { bg: '#FEE2E2', text: '#991B1B' },
  };
  return map[status] ?? { bg: '#F3F4F6', text: '#374151' };
};

export const capitalize = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

