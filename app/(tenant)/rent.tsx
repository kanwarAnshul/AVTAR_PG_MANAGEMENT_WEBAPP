import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius, PAYMENT_MODES } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatCurrency, formatDate, getBillingPeriodLabel, generateReceiptNo, canChangeDueDay, dueDayOptions, buildDueDate, friendlyDbError } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';

export default function TenantRentScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [paymentMode, setPaymentMode] = useState<string>('upi');
  const [referenceNo, setReferenceNo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dueDay, setDueDay] = useState<number | null>(null);
  const [dueDaySaving, setDueDaySaving] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['tenant-rent-data', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id, property_id, full_name, current_tenancy:tenancies!inner(id, due_day, check_in_date, room:rooms(room_no), bed:beds(label))')
        .eq('user_id', user.id)
        .eq('tenancies.status', 'active')
        .maybeSingle();

      if (!tenant) return null;

      const tenancy = (tenant as any).current_tenancy?.[0];
      // Default due day = allocation (check-in) day per business rule.
      const defaultDueDay = tenancy?.due_day ??
        (tenancy?.check_in_date ? new Date(tenancy.check_in_date).getDate() : new Date().getDate());
      setDueDay(defaultDueDay);

      const { data: invoices } = await supabase
        .from('invoices')
        .select('*, invoice_lines(*)')
        .eq('tenant_id', (tenant as any).id)
        .order('billing_period', { ascending: false });

      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .eq('tenant_id', (tenant as any).id)
        .order('payment_date', { ascending: false });

      return { tenant, invoices: invoices || [], payments: payments || [] };
    },
    enabled: !!user,
  });

  // Due date = allocation date. Tenants may change it only before the 15th.
  const saveDueDay = async (day: number) => {
    const tenancy = (data as any)?.tenant?.current_tenancy?.[0];
    if (!tenancy) return;
    if (!canChangeDueDay()) {
      Alert.alert('Locked', 'Due date can only be changed before the 15th of the month. It will unlock next month.');
      return;
    }
    setDueDaySaving(true);
    try {
      const { error } = await supabase
        .from('tenancies')
        .update({ due_day: day } as any)
        .eq('id', tenancy.id);
      if (error) throw new Error(friendlyDbError(error));

      // Push the new day onto all unpaid invoices.
      const unpaid = ((data as any)?.invoices || []).filter((inv: any) => inv.balance_due > 0);
      for (const inv of unpaid) {
        await supabase
          .from('invoices')
          .update({ due_date: buildDueDate(inv.billing_period, day) } as any)
          .eq('id', inv.id);
      }
      setDueDay(day);
      queryClient.invalidateQueries({ queryKey: ['tenant-rent-data'] });
      Alert.alert('Due Date Updated', `Your rent will now be due on the ${day}th every month.`);
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message ?? 'Could not update due date');
    } finally {
      setDueDaySaving(false);
    }
  };

  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!data?.tenant || !selectedInvoice) throw new Error('Missing invoice or tenant');
      setIsSubmitting(true);
      const receiptNo = generateReceiptNo();
      const amountPaise = selectedInvoice.balance_due;

      // 1. Insert Payment
      const { data: payment, error: pError } = await supabase
        .from('payments')
        .insert({
          tenant_id: data.tenant.id,
          property_id: data.tenant.property_id,
          amount: amountPaise,
          mode: paymentMode,
          reference_no: referenceNo || null,
          receipt_no: receiptNo,
          notes: `Rent for ${selectedInvoice.billing_period}`,
        })
        .select()
        .single();

      if (pError) throw pError;

      // 2. Allocate payment to invoice
      const { error: aError } = await supabase
        .from('payment_allocations')
        .insert({
          payment_id: payment.id,
          invoice_id: selectedInvoice.id,
          amount: amountPaise,
        });

      if (aError) throw aError;
      return { receiptNo, amountPaise };
    },
    onSuccess: ({ receiptNo }) => {
      setIsSubmitting(false);
      setPaymentModalVisible(false);
      setReferenceNo('');
      queryClient.invalidateQueries({ queryKey: ['tenant-rent-data'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-dashboard'] });
      Alert.alert('Payment Recorded', `Payment recorded successfully! Receipt #${receiptNo}`);
    },
    onError: (err: any) => {
      setIsSubmitting(false);
      Alert.alert('Error', err.message || 'Payment recording failed');
    },
  });

  const generatePDFReceipt = async (invoice: any) => {
    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, sans-serif; padding: 30px; color: #0F172A; }
            .header { text-align: center; border-bottom: 2px solid #6366F1; padding-bottom: 15px; margin-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; color: #4F46E5; }
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
            .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .table th, .table td { border: 1px solid #E2E8F0; padding: 10px; text-align: left; }
            .table th { background: #F1F5F9; }
            .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
            .paid { background: #DCFCE7; color: #166534; }
            .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #64748B; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">AVTAR SINGH PG</div>
            <div>Rent Invoice & Payment Receipt</div>
          </div>
          <div class="row">
            <div><strong>Invoice No:</strong> ${invoice.invoice_no}</div>
            <div><strong>Date:</strong> ${formatDate(invoice.issue_date)}</div>
          </div>
          <div class="row">
            <div><strong>Tenant:</strong> ${data?.tenant?.full_name}</div>
            <div><strong>Period:</strong> ${getBillingPeriodLabel(invoice.billing_period)}</div>
          </div>
          <div class="row">
            <div><strong>Status:</strong> <span class="badge paid">${invoice.status.toUpperCase()}</span></div>
            <div><strong>Due Date:</strong> ${formatDate(invoice.due_date)}</div>
          </div>
          <table class="table">
            <thead>
              <tr><th>Description</th><th>Amount</th></tr>
            </thead>
            <tbody>
              ${(invoice.invoice_lines || [])
                .map((l: any) => `<tr><td>${l.description}</td><td>${formatCurrency(l.amount)}</td></tr>`)
                .join('')}
              <tr><td><strong>Total Amount</strong></td><td><strong>${formatCurrency(invoice.total_amount)}</strong></td></tr>
              <tr><td><strong>Paid Amount</strong></td><td><strong>${formatCurrency(invoice.paid_amount)}</strong></td></tr>
              <tr><td><strong>Balance Due</strong></td><td><strong>${formatCurrency(invoice.balance_due)}</strong></td></tr>
            </tbody>
          </table>
          <div class="footer">
            <p>Generated automatically by AVTAR SINGH PG Manager System.</p>
            <p>Thank you for your prompt payment!</p>
          </div>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('Receipt Ready', `Saved to ${uri}`);
      }
    } catch (err: any) {
      Alert.alert('Error', 'Failed to generate PDF receipt');
    }
  };

  if (isLoading) return <LoadingView message="Loading rent details..." />;

  const { invoices = [], payments = [] } = data || {};
  const totalDue = invoices.reduce((acc: number, inv: any) => acc + (inv.balance_due || 0), 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Rent & Invoices" subtitle="View statements, pay rent & download receipts" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={Colors.primary} />}
      >
        {/* Total Outstanding Card */}
        <Card variant="elevated" style={[styles.summaryCard, { backgroundColor: totalDue > 0 ? (isDark ? '#3B1E22' : '#FEF2F2') : (isDark ? '#1C3127' : '#F0FDF4') }]}>
          <Text style={[styles.summaryLabel, { color: totalDue > 0 ? Colors.error : Colors.success }]}>
            {totalDue > 0 ? 'TOTAL OUTSTANDING DUES' : 'ALL DUES CLEARED'}
          </Text>
          <Text style={[styles.summaryAmount, { color: totalDue > 0 ? Colors.error : Colors.success }]}>
            {formatCurrency(totalDue)}
          </Text>
          <Text style={[styles.summarySub, { color: theme.textSecondary }]}>
            {totalDue > 0 ? 'Please clear overdue invoices on time to avoid late fees.' : 'You have no pending rent invoices.'}
          </Text>
        </Card>

        {/* Due Date Rule */}
        <Card style={styles.dueDayCard}>
          <Text style={[styles.sectionHeading, { color: theme.text }]}>📅 YOUR RENT DUE DATE</Text>
          <Text style={[styles.dueDayText, { color: theme.textSecondary }]}>
            Due on the <Text style={{ color: theme.text, fontFamily: Typography.fontFamily.bold }}>{dueDay ?? '—'}th</Text> every month
            {' '}(set to your room allocation date).
          </Text>
          {canChangeDueDay() ? (
            <>
              <Text style={[styles.dueDayHint, { color: theme.textSecondary }]}>
                You are before the 15th — tap a day to change it. Future bills will use the new date.
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dueDayRow}>
                {dueDayOptions().map((day) => (
                  <TouchableOpacity
                    key={day}
                    onPress={() => saveDueDay(day)}
                    disabled={dueDaySaving || dueDay === day}
                    style={[
                      styles.dueDayChip,
                      { borderColor: theme.border, backgroundColor: dueDay === day ? Colors.primary : theme.surfaceAlt },
                      { opacity: dueDaySaving ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={{ color: dueDay === day ? '#FFF' : theme.text, fontFamily: Typography.fontFamily.semiBold, fontSize: 12 }}>
                      {day}th
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : (
            <Text style={[styles.dueDayLocked, { color: Colors.error }]}>
              🔒 Locked after the 15th — you can change the due date again from the 1st of next month.
            </Text>
          )}
        </Card>

        {/* Invoices List */}
        <Text style={[styles.sectionHeading, { color: theme.text }]}>INVOICE STATEMENTS</Text>
        {invoices.length === 0 ? (
          <EmptyState icon="📄" title="No Invoices Yet" description="Your monthly invoices will appear here once generated by the owner." />
        ) : (
          invoices.map((inv: any) => (
            <Card key={inv.id} style={styles.invoiceCard}>
              <View style={styles.invoiceHeader}>
                <View>
                  <Text style={[styles.invoicePeriod, { color: theme.text }]}>{getBillingPeriodLabel(inv.billing_period)}</Text>
                  <Text style={[styles.invoiceNo, { color: theme.textSecondary }]}>#{inv.invoice_no} · Due {formatDate(inv.due_date)}</Text>
                </View>
                <Badge label={inv.status} status={inv.status} />
              </View>

              <View style={[styles.invoiceBody, { borderTopColor: theme.border, borderBottomColor: theme.border }]}>
                <View style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Total Amount</Text>
                  <Text style={[styles.metricValue, { color: theme.text }]}>{formatCurrency(inv.total_amount)}</Text>
                </View>
                <View style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Paid Amount</Text>
                  <Text style={[styles.metricValue, { color: Colors.success }]}>{formatCurrency(inv.paid_amount)}</Text>
                </View>
                <View style={styles.metricRow}>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Balance Due</Text>
                  <Text style={[styles.metricValue, { color: inv.balance_due > 0 ? Colors.error : Colors.success, fontFamily: Typography.fontFamily.bold }]}>
                    {formatCurrency(inv.balance_due)}
                  </Text>
                </View>
              </View>

              <View style={styles.invoiceActions}>
                <Button
                  title="📄 View PDF"
                  variant="outline"
                  size="sm"
                  fullWidth={false}
                  onPress={() => generatePDFReceipt(inv)}
                  style={{ flex: 1, marginRight: Spacing.sm }}
                />
                {inv.balance_due > 0 && (
                  <Button
                    title="💳 Pay Now"
                    variant="primary"
                    size="sm"
                    fullWidth={false}
                    onPress={() => {
                      setSelectedInvoice(inv);
                      setPaymentModalVisible(true);
                    }}
                    style={{ flex: 1 }}
                  />
                )}
              </View>
            </Card>
          ))
        )}

        {/* Payment History */}
        {payments.length > 0 && (
          <>
            <Text style={[styles.sectionHeading, { color: theme.text, marginTop: Spacing.lg }]}>PAYMENT HISTORY</Text>
            {payments.map((p: any) => (
              <Card key={p.id} style={styles.paymentCard}>
                <View style={styles.paymentRow}>
                  <View>
                    <Text style={[styles.paymentTitle, { color: theme.text }]}>{p.receipt_no || 'Payment Received'}</Text>
                    <Text style={[styles.paymentDate, { color: theme.textSecondary }]}>
                      {formatDate(p.payment_date)} · {p.mode?.toUpperCase()} {p.reference_no ? `· Ref: ${p.reference_no}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.paymentAmount, { color: Colors.success }]}>
                    +{formatCurrency(p.amount)}
                  </Text>
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>

      {/* Payment Confirmation Modal */}
      <Modal visible={paymentModalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Record Rent Payment</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              {selectedInvoice && `Paying for ${getBillingPeriodLabel(selectedInvoice.billing_period)}`}
            </Text>

            <View style={[styles.amountBox, { backgroundColor: theme.surfaceAlt }]}>
              <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>Amount to Pay</Text>
              <Text style={[styles.amountDisplay, { color: Colors.primary }]}>
                {selectedInvoice ? formatCurrency(selectedInvoice.balance_due) : ''}
              </Text>
            </View>

            <Text style={[styles.inputLabel, { color: theme.text }]}>Payment Mode</Text>
            <View style={styles.modeSelector}>
              {PAYMENT_MODES.map((m) => (
                <TouchableOpacity
                  key={m.value}
                  onPress={() => setPaymentMode(m.value)}
                  style={[
                    styles.modeBtn,
                    {
                      backgroundColor: paymentMode === m.value ? Colors.primary : theme.surfaceAlt,
                      borderColor: paymentMode === m.value ? Colors.primary : theme.border,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 16 }}>{m.icon}</Text>
                  <Text style={[styles.modeText, { color: paymentMode === m.value ? '#FFF' : theme.text }]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Input
              label="UPI ID / Transaction Reference (Optional)"
              placeholder="e.g. UPI Ref / Bank Txn ID"
              value={referenceNo}
              onChangeText={setReferenceNo}
            />

            <View style={styles.modalBtns}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setPaymentModalVisible(false)}
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
              <Button
                title="Confirm Payment"
                variant="primary"
                onPress={() => recordPaymentMutation.mutate()}
                isLoading={isSubmitting}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  summaryCard: { padding: Spacing.lg, borderRadius: BorderRadius.xl, marginBottom: Spacing.lg, alignItems: 'center' },
  summaryLabel: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1 },
  summaryAmount: { fontFamily: Typography.fontFamily.extraBold, fontSize: Typography.size['3xl'], marginVertical: Spacing.xs },
  summarySub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, textAlign: 'center' },
  sectionHeading: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  dueDayCard: { padding: Spacing.base, marginBottom: Spacing.base },
  dueDayText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, marginBottom: Spacing.sm },
  dueDayHint: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginBottom: Spacing.sm, lineHeight: 18 },
  dueDayRow: { marginTop: 4 },
  dueDayChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, marginRight: 8, minWidth: 52, alignItems: 'center' },
  dueDayLocked: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, lineHeight: 20 },
  invoiceCard: { marginBottom: Spacing.md, padding: Spacing.base },
  invoiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  invoicePeriod: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  invoiceNo: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  invoiceBody: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: Spacing.sm, marginVertical: Spacing.sm },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 },
  metricLabel: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm },
  metricValue: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm },
  invoiceActions: { flexDirection: 'row', marginTop: Spacing.xs },
  paymentCard: { marginBottom: Spacing.sm, padding: Spacing.md },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentTitle: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm },
  paymentDate: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  paymentAmount: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: BorderRadius['2xl'], borderTopRightRadius: BorderRadius['2xl'], padding: Spacing.xl },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  modalSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, marginBottom: Spacing.base },
  amountBox: { padding: Spacing.base, borderRadius: BorderRadius.lg, alignItems: 'center', marginBottom: Spacing.base },
  amountLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs },
  amountDisplay: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], marginTop: 4 },
  inputLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, marginBottom: Spacing.xs },
  modeSelector: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.base },
  modeBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1, alignItems: 'center', gap: 2 },
  modeText: { fontFamily: Typography.fontFamily.medium, fontSize: 11 },
  modalBtns: { flexDirection: 'row', marginTop: Spacing.md },
});
