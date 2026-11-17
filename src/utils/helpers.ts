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

// ── Due-date rules ──────────────────────────────────────────
// Rent due date = room allocation date. Tenants may only change the
// monthly due day *before* the 15th of the current month.
export const DUE_DATE_CHANGE_CUTOFF_DAY = 15;
export const DUE_REMINDER_LEAD_DAYS = 5;

export const canChangeDueDay = (now: Date = new Date()): boolean =>
  now.getDate() < DUE_DATE_CHANGE_CUTOFF_DAY;

/** Day-of-month a tenant is allowed to pick for their due date (1–28 to stay safe across all months). */
export const dueDayOptions = (): number[] =>
  Array.from({ length: 28 }, (_, i) => i + 1);

/** Build a due-date YYYY-MM-DD for a billing period given a due day. */
export const buildDueDate = (billingPeriod: string, dueDay: number): string => {
  const [year, month] = billingPeriod.split('-').map(Number);
  const safeDay = Math.min(Math.max(1, dueDay), 28);
  const m = String(month).padStart(2, '0');
  const d = String(safeDay).padStart(2, '0');
  return `${year}-${m}-${d}`;
};

/** Days until a due date (negative = overdue). */
export const daysUntil = (dueDateStr: string, now: Date = new Date()): number => {
  const due = new Date(dueDateStr + 'T23:59:59');
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((due.getTime() - now.getTime()) / msPerDay);
};

export const todayLocalISO = (now: Date = new Date()): string => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

// Friendly database / auth error messages (data-saving failures)
export const friendlyDbError = (err: unknown): string => {
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err ?? 'Unknown error');
  const lower = message.toLowerCase();
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch')) {
    return 'You appear to be offline. Please check your internet connection and try again.';
  }
  if (lower.includes('row-level security') || lower.includes('rls') || lower.includes('permission denied') || lower.includes('new row violates') || lower.includes('violates row')) {
    return 'Save blocked by security policy. Your role may not have permission for this action — try signing out and back in, or contact the owner.';
  }
  if (lower.includes('duplicate') || lower.includes('unique') || lower.includes('already exists') || lower.includes('23505')) {
    return 'This record already exists. It may have been saved just now — refreshing the list.';
  }
  if (lower.includes('foreign key') || lower.includes('23503')) {
    return 'Referenced record is missing. Please refresh and try again.';
  }
  if (lower.includes('not-null') || lower.includes('23502') || lower.includes('null value')) {
    return 'Some required information is missing. Please fill all required fields and try again.';
  }
  if (lower.includes('pgrst202') || lower.includes('could not find the function') || lower.includes('function') && lower.includes('does not exist')) {
    return 'Database function is missing. Please run the latest Supabase migration (006_storage_and_otp.sql) and try again.';
  }
  if (lower.includes('does not exist') || lower.includes('could not find') || lower.includes('42p01') || lower.includes('42703')) {
    return 'Database table/column is not set up yet. Please apply the latest Supabase migration (006_storage_and_otp.sql) and try again.';
  }
  if (lower.includes('invalid') && lower.includes('jwt')) {
    return 'Your session has expired. Please sign in again.';
  }
  if (lower.includes('unauthorized') || lower.includes('not authenticated')) {
    return 'You are not signed in. Please sign in and try again.';
  }
  return message;
};

// Status colors
// Semantic green / amber / red are kept (they mean the same thing
// everywhere); the neutral and blue chips are tinted to match the
// Olive & Ember palette.
export const getStatusColor = (status: string): { bg: string; text: string } => {
  const map: Record<string, { bg: string; text: string }> = {
    pending:     { bg: '#FBF0D6', text: '#8A6111' },
    approved:    { bg: '#E4F0DC', text: '#3D6B2A' },
    rejected:    { bg: '#FBE3E1', text: '#9B2C22' },
    resubmission:{ bg: '#E6EFF3', text: '#2A5F7C' },
    open:        { bg: '#FBF0D6', text: '#8A6111' },
    in_progress: { bg: '#E8EDD4', text: '#3F4C1C' },
    resolved:    { bg: '#E4F0DC', text: '#3D6B2A' },
    closed:      { bg: '#EFF1E6', text: '#4A5140' },
    available:   { bg: '#E4F0DC', text: '#3D6B2A' },
    occupied:    { bg: '#FBE3E1', text: '#9B2C22' },
    maintenance: { bg: '#FBF0D6', text: '#8A6111' },
    paid:        { bg: '#E4F0DC', text: '#3D6B2A' },
    partial:     { bg: '#FBF0D6', text: '#8A6111' },
    overdue:     { bg: '#FBE3E1', text: '#9B2C22' },
    draft:       { bg: '#EFF1E6', text: '#4A5140' },
    sent:        { bg: '#E6EFF3', text: '#2A5F7C' },
    active:      { bg: '#E4F0DC', text: '#3D6B2A' },
    checked_out: { bg: '#EFF1E6', text: '#4A5140' },
    present:     { bg: '#E4F0DC', text: '#3D6B2A' },
    absent:      { bg: '#FBE3E1', text: '#9B2C22' },
    fine:        { bg: '#FBE3E1', text: '#9B2C22' },
    low:         { bg: '#E4F0DC', text: '#3D6B2A' },
    medium:      { bg: '#FBF0D6', text: '#8A6111' },
    high:        { bg: '#FBEBDD', text: '#9A4A12' },
    urgent:      { bg: '#FBE3E1', text: '#9B2C22' },
  };
  return map[status] ?? { bg: '#EFF1E6', text: '#4A5140' };
};

export const capitalize = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
