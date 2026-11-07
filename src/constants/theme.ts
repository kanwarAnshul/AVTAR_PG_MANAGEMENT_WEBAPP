// ============================================================
// DESIGN TOKENS & THEME CONSTANTS
// Professional dark/light theme for AVTAR PG Manager
// ============================================================

export const Colors = {
  // Brand
  primary: '#6366F1',       // Indigo-500
  primaryDark: '#4F46E5',   // Indigo-600
  primaryLight: '#818CF8',  // Indigo-400
  accent: '#F59E0B',        // Amber-500

  // Status
  success: '#10B981',       // Emerald-500
  warning: '#F59E0B',       // Amber-500
  error: '#EF4444',         // Red-500
  info: '#3B82F6',          // Blue-500

  // Chips
  studentBg: '#DBEAFE',
  studentText: '#1E40AF',
  employeeBg: '#F3E8FF',
  employeeText: '#6B21A8',
  pendingBg: '#FEF3C7',
  pendingText: '#92400E',
  approvedBg: '#DCFCE7',
  approvedText: '#166534',
  rejectedBg: '#FEE2E2',
  rejectedText: '#991B1B',

  // Dark theme
  dark: {
    background: '#0F172A',   // Slate-900
    surface: '#1E293B',      // Slate-800
    surfaceAlt: '#334155',   // Slate-700
    border: '#475569',       // Slate-600
    text: '#F8FAFC',         // Slate-50
    textSecondary: '#94A3B8', // Slate-400
    textMuted: '#64748B',    // Slate-500
    card: '#1E293B',
    input: '#0F172A',
    tabBar: '#1E293B',
    tabBarBorder: '#334155',
    statusBar: 'light',
    overlay: 'rgba(0,0,0,0.6)',
  },

  // Light theme
  light: {
    background: '#F8FAFC',   // Slate-50
    surface: '#FFFFFF',
    surfaceAlt: '#F1F5F9',   // Slate-100
    border: '#E2E8F0',       // Slate-200
    text: '#0F172A',         // Slate-900
    textSecondary: '#475569', // Slate-600
    textMuted: '#94A3B8',    // Slate-400
    card: '#FFFFFF',
    input: '#F8FAFC',
    tabBar: '#FFFFFF',
    tabBarBorder: '#E2E8F0',
    statusBar: 'dark',
    overlay: 'rgba(0,0,0,0.5)',
  },
};

import { Platform } from 'react-native';

export const Typography = {
  fontFamily: {
    regular: Platform.select({ ios: 'Inter_400Regular', android: 'sans-serif', default: 'System' }),
    medium: Platform.select({ ios: 'Inter_500Medium', android: 'sans-serif-medium', default: 'System' }),
    semiBold: Platform.select({ ios: 'Inter_600SemiBold', android: 'sans-serif-medium', default: 'System' }),
    bold: Platform.select({ ios: 'Inter_700Bold', android: 'sans-serif-medium', default: 'System' }),
    extraBold: Platform.select({ ios: 'Inter_800ExtraBold', android: 'sans-serif', default: 'System' }),
  },
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 19,
    xl: 22,
    '2xl': 26,
    '3xl': 30,
    '4xl': 36,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
};

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  '2xl': 24,
  full: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  primary: {
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
};

export const APP_NAME = 'AVTAR SINGH PG';
export const APP_VERSION = '1.0.0';

export const COMPLAINT_CATEGORIES = [
  { label: 'Water Issue', value: 'water', icon: '💧' },
  { label: 'Electricity', value: 'electricity', icon: '⚡' },
  { label: 'Cleaning', value: 'cleaning', icon: '🧹' },
  { label: 'Furniture', value: 'furniture', icon: '🪑' },
  { label: 'WiFi / Internet', value: 'wifi', icon: '📶' },
  { label: 'Plumbing', value: 'plumbing', icon: '🔧' },
  { label: 'Security', value: 'security', icon: '🔐' },
  { label: 'Others', value: 'others', icon: '📋' },
];

export const PAYMENT_MODES = [
  { label: 'Cash', value: 'cash', icon: '💵' },
  { label: 'UPI', value: 'upi', icon: '📲' },
  { label: 'Bank Transfer', value: 'bank_transfer', icon: '🏦' },
  { label: 'Cheque', value: 'cheque', icon: '📄' },
];

export const ADDRESS_PROOF_TYPES = [
  'Aadhaar Card',
  'Voter ID',
  'Electricity Bill',
  'Passport',
  'Driving License',
  'Rent Agreement',
];

export const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
export const IMAGE_COMPRESS_SIZE = 800;
export const IMAGE_COMPRESS_QUALITY = 0.7;

