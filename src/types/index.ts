// ============================================================
// TypeScript Types — AVTAR PG Manager
// ============================================================

export type UserRole = 'owner' | 'warden' | 'tenant';
export type TenantCategory = 'student' | 'employee';
export type RegistrationStatus = 'pending' | 'approved' | 'rejected' | 'resubmission';
export type VerificationMethod = 'digital' | 'manual';
export type BedStatus = 'available' | 'occupied' | 'maintenance';
export type TenancyStatus = 'active' | 'checked_out';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'overdue';
export type PaymentMode = 'cash' | 'upi' | 'bank_transfer' | 'cheque';
export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type ComplaintPriority = 'low' | 'medium' | 'high' | 'urgent';
export type NotificationType = 'approval' | 'rejection' | 'rent_due' | 'rent_paid' | 'complaint_update' | 'notice' | 'checkout';

export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  phone?: string;
  avatar_url?: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  owner_id: string;
  name: string;
  address: string;
  city?: string;
  state?: string;
  pincode?: string;
  rules?: string;
  total_capacity?: number;
  is_active: boolean;
  created_at: string;
}

export interface Room {
  id: string;
  property_id: string;
  room_no: string;
  floor: number;
  sharing_type: number;
  monthly_rent: number; // paise
  deposit_amt: number;  // paise
  amenities?: string[];
  is_active: boolean;
  created_at: string;
}

export interface Bed {
  id: string;
  room_id: string;
  label: string;
  status: BedStatus;
  created_at: string;
  // Joined
  room?: Room;
}

export interface TenantRegistration {
  id: string;
  user_id: string;
  property_id?: string;
  category: TenantCategory;
  full_name: string;
  // Student
  college_name?: string;
  roll_number?: string;
  course?: string;
  year_of_study?: number;
  // Employee
  company_name?: string;
  employee_id?: string;
  work_email?: string;
  designation?: string;
  // Common
  phone?: string;
  date_of_birth?: string;
  permanent_address: string;
  family_contact_name?: string;
  family_contact_phone?: string;
  family_relation?: string;
  // Documents
  photo_url?: string;
  address_proof_type?: string;
  address_proof_url?: string;
  aadhaar_front_url?: string;
  aadhaar_back_url?: string;
  pan_encrypted?: string;
  // Approval
  status: RegistrationStatus;
  verification_method?: VerificationMethod;
  reviewer_id?: string;
  decision_reason?: string;
  submitted_at: string;
  reviewed_at?: string;
  created_at: string;
  // Joined
  property?: Property;
  reviewer?: Profile;
}

export interface Tenant {
  id: string;
  user_id: string;
  registration_id: string;
  property_id: string;
  category: TenantCategory;
  full_name: string;
  phone?: string;
  joined_at: string;
  // Joined
  property?: Property;
  current_tenancy?: Tenancy;
}

export interface Tenancy {
  id: string;
  tenant_id: string;
  property_id: string;
  room_id: string;
  bed_id: string;
  monthly_rent: number; // paise
  deposit_paid: number; // paise
  check_in_date: string;
  check_out_date?: string;
  expected_checkout?: string;
  status: TenancyStatus;
  created_at: string;
  // Joined
  room?: Room;
  bed?: Bed;
  tenant?: Tenant;
}

export interface Invoice {
  id: string;
  tenancy_id: string;
  tenant_id: string;
  property_id: string;
  billing_period: string; // YYYY-MM
  invoice_no: string;
  issue_date: string;
  due_date: string;
  total_amount: number; // paise
  paid_amount: number;  // paise
  balance_due: number;  // paise
  status: InvoiceStatus;
  notes?: string;
  created_at: string;
  // Joined
  invoice_lines?: InvoiceLine[];
  tenant?: Tenant;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  description: string;
  amount: number; // paise
  line_type: string;
}

export interface Payment {
  id: string;
  tenant_id: string;
  property_id: string;
  amount: number; // paise
  mode: PaymentMode;
  reference_no?: string;
  received_by?: string;
  payment_date: string;
  notes?: string;
  receipt_no?: string;
  created_at: string;
  // Joined
  tenant?: Tenant;
}

export interface Complaint {
  id: string;
  tenant_id: string;
  property_id: string;
  room_id?: string;
  category: string;
  title: string;
  description?: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  photo_url?: string;
  resolved_by?: string;
  resolved_at?: string;
  resolution_note?: string;
  created_at: string;
  updated_at: string;
  // Joined
  tenant?: Tenant;
  comments?: ComplaintComment[];
}

export interface ComplaintComment {
  id: string;
  complaint_id: string;
  author_id: string;
  comment: string;
  created_at: string;
  author?: Profile;
}

export interface Notice {
  id: string;
  property_id: string;
  author_id: string;
  type: string;
  title: string;
  body: string;
  is_pinned: boolean;
  expires_at?: string;
  created_at: string;
  author?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export interface Expense {
  id: string;
  property_id: string;
  category: string;
  description: string;
  amount: number; // paise
  expense_date: string;
  receipt_url?: string;
  created_by?: string;
  created_at: string;
}

// Dashboard stats
export interface OwnerDashboardStats {
  total_collection: number;      // paise
  total_expenses: number;        // paise
  total_tenants: number;
  occupied_beds: number;
  total_beds: number;
  pending_approvals: number;
  open_complaints: number;
  pending_dues: number;          // paise
}

export interface WardenDashboardStats {
  property_name: string;
  pending_approvals: number;
  occupied_beds: number;
  total_beds: number;
  total_dues: number;            // paise
  open_complaints: number;
}

// Form types
export interface StudentRegistrationForm {
  full_name: string;
  phone: string;
  date_of_birth: string;
  college_name: string;
  roll_number: string;
  course: string;
  year_of_study: string;
  permanent_address: string;
  family_contact_name: string;
  family_contact_phone: string;
  family_relation: string;
  address_proof_type: string;
}

export interface EmployeeRegistrationForm {
  full_name: string;
  phone: string;
  date_of_birth: string;
  company_name: string;
  employee_id: string;
  work_email: string;
  designation: string;
  permanent_address: string;
  family_contact_name: string;
  family_contact_phone: string;
  family_relation: string;
  pan_number: string;
}

