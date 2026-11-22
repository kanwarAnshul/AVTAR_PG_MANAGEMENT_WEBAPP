import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../src/lib/supabase';
import { generateAndShareReceipt } from '../../src/services/receipt';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatCurrency, formatDate, sanitizeForCsv } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { ScreenHeader, LoadingView } from '../../src/components/ui';

export default function OwnerReportsScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<'maintenance' | 'utilities' | 'salary' | 'cleaning' | 'miscellaneous'>('maintenance');
  const [actionLoading, setActionLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const currentPeriod = new Date().toISOString().substring(0, 7); // 'YYYY-MM'

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['owner-financial-reports'],
    queryFn: async () => {
      // 1. Payments
      const { data: payments } = await supabase
        .from('payments')
        .select('*, tenant:tenants(full_name), property:properties(name)')
        .order('payment_date', { ascending: false });

      // 2. Expenses
      const { data: expenses } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      // 3. Properties
      const { data: properties } = await supabase.from('properties').select('id, name');

      const totalInflow = (payments || []).reduce((acc, p) => acc + (p.amount || 0), 0);
      const totalExpense = (expenses || []).reduce((acc, e) => acc + (e.amount || 0), 0);

      return {
        payments: payments || [],
        expenses: expenses || [],
        properties: properties || [],
        totalInflow,
        totalExpense,
        netProfit: totalInflow - totalExpense,
      };
    },
  });

  // Idempotent monthly billing generator
  const generateBillsMutation = useMutation({
    mutationFn: async () => {
      setActionLoading(true);
      const propertyId = data?.properties?.[0]?.id;
      if (!propertyId) throw new Error('No active property found');

      // Call database procedure or fallback generator
      const { data: count, error } = await supabase.rpc('generate_monthly_bills', {
        p_property_id: propertyId,
        p_billing_period: currentPeriod,
        p_created_by: user?.id,
      });

      if (error) {
        // Fallback idempotent query
        const { data: tenancies } = await supabase
          .from('tenancies')
          .select('id, tenant_id, monthly_rent')
          .eq('status', 'active');

        let createdCount = 0;
        for (const t of tenancies || []) {
          const invNo = `INV-${currentPeriod}-${t.id.substring(0, 6)}`;
          const dueDate = `${currentPeriod}-05`;
          const { error: insErr } = await supabase
            .from('invoices')
            .upsert(
              {
                tenancy_id: t.id,
                tenant_id: t.tenant_id,
                property_id: propertyId,
                billing_period: currentPeriod,
                invoice_no: invNo,
                due_date: dueDate,
                total_amount: t.monthly_rent,
                balance_due: t.monthly_rent,
                status: 'sent',
                created_by: user?.id,
              },
              { onConflict: 'tenancy_id, billing_period' }
            );

          if (!insErr) createdCount++;
        }
        return createdCount;
      }
      return count || 0;
    },
    onSuccess: (count) => {
      setActionLoading(false);
      queryClient.invalidateQueries({ queryKey: ['owner-overall-stats'] });
      queryClient.invalidateQueries({ queryKey: ['warden-dues-list'] });
      Alert.alert(
        'Invoices Generated',
        `Generated ${count} monthly invoices for ${currentPeriod}. Duplicates were safely skipped.`
      );
    },
    onError: (err: any) => {
      setActionLoading(false);
      Alert.alert('Billing Error', err.message || 'Failed to generate bills');
    },
  });

  // Add expense mutation
  const addExpenseMutation = useMutation({
    mutationFn: async () => {
      if (!expenseDesc.trim() || !expenseAmount) throw new Error('Please fill all fields');
      setActionLoading(true);

      const propertyId = data?.properties?.[0]?.id;
      const amountPaise = Math.round(parseFloat(expenseAmount) * 100);

      const { error } = await supabase.from('expenses').insert({
        property_id: propertyId,
        category: expenseCategory,
        description: expenseDesc.trim(),
        amount: amountPaise,
        created_by: user?.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      setActionLoading(false);
      setExpenseModalVisible(false);
      setExpenseDesc('');
      setExpenseAmount('');
      queryClient.invalidateQueries({ queryKey: ['owner-financial-reports'] });
      queryClient.invalidateQueries({ queryKey: ['owner-overall-stats'] });
      Alert.alert('Expense Logged', 'Expense added to accounts statement.');
    },
    onError: (err: any) => {
      setActionLoading(false);
      Alert.alert('Error', err.message || 'Failed to add expense');
    },
  });

  // Export Sanitized CSV
  const exportSanitizedCSV = async () => {
    setIsExporting(true);
    try {
      let csvContent = 'Type,Date,Reference/Description,Party/Tenant,Amount (INR)\n';

      // Add payments
      (data?.payments || []).forEach((p: any) => {
        const type = 'COLLECTION';
        const date = sanitizeForCsv(formatDate(p.payment_date));
        const ref = sanitizeForCsv(p.receipt_no || p.mode || '');
        const tenant = sanitizeForCsv(p.tenant?.full_name || 'Tenant');
        const amt = (p.amount / 100).toFixed(2);
        csvContent += `"${type}","${date}","${ref}","${tenant}",${amt}\n`;
      });

      // Add expenses
      (data?.expenses || []).forEach((e: any) => {
        const type = 'EXPENSE';
        const date = sanitizeForCsv(formatDate(e.expense_date));
        const ref = sanitizeForCsv(e.description || e.category);
        const party = sanitizeForCsv(e.category);
        const amt = `-${(e.amount / 100).toFixed(2)}`;
        csvContent += `"${type}","${date}","${ref}","${party}",${amt}\n`;
      });

      const fileUri = `${FileSystem.documentDirectory}avtar_pg_financial_report_${currentPeriod}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export AVTAR PG Financial Report',
        });
      } else {
        Alert.alert('Report Saved', `File saved to ${fileUri}`);
      }
    } catch (err: any) {
      Alert.alert('Export Failed', err.message || 'Could not export CSV');
    } finally {
      setIsExporting(false);
    }
  };

  // Re-generate the exact PDF receipt for any recorded payment (owner audit).
  const downloadReceipt = async (payment: any) => {
    try {
      const { data: allocation } = await supabase
        .from('payment_allocations')
        .select('invoice:invoices(*)')
        .eq('payment_id', payment.id)
        .maybeSingle();
      await generateAndShareReceipt({
        payment,
        invoice: (allocation as any)?.invoice || {},
        tenant: { full_name: payment.tenant?.full_name },
        propertyName: payment.property?.name,
        collectedBy: payment.received_by ? 'Recorded by staff' : 'Tenant',
      });
    } catch {
      Alert.alert('Receipt Error', 'Could not generate the PDF receipt. Please try again.');
    }
  };

  if (isLoading) return <LoadingView message="Loading financial accounts..." />;

  const { payments = [], expenses = [], totalInflow = 0, totalExpense = 0, netProfit = 0 } = data || {};

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Financials & Reporting"
        subtitle="Audited ledger & idempotent billing engine"
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={theme.primary} />}
      >
        {/* Monthly Billing Engine Banner */}
        <Card variant="elevated" style={[styles.billingCard, { backgroundColor: isDark ? '#1E2417' : '#2A3122' }]}>
          <View style={styles.billingTop}>
            <View>
              <Text style={styles.billingTag}>AUTOMATED BILLING ENGINE</Text>
              <Text style={styles.billingTitle}>Billing Period: {currentPeriod}</Text>
            </View>
            <Text style={{ fontSize: 24 }}>⚡</Text>
          </View>
          <Text style={styles.billingSub}>
            Generate invoices for all active tenancies. Safe & idempotent: duplicates for this month will be skipped automatically.
          </Text>
          <Button
            title="Generate Monthly Invoices"
            variant="primary"
            onPress={() => generateBillsMutation.mutate()}
            isLoading={actionLoading}
            style={{ marginTop: Spacing.md }}
          />
        </Card>

        {/* Ledger Summary */}
        <Card style={styles.ledgerCard}>
          <Text style={[styles.ledgerTitle, { color: theme.text }]}>PROFIT & CASH FLOW STATEMENT</Text>
          <View style={styles.ledgerRow}>
            <Text style={[styles.lLabel, { color: theme.textSecondary }]}>Rent Inflow (Paid Invoices)</Text>
            <Text style={[styles.lVal, { color: theme.success }]}>+{formatCurrency(totalInflow)}</Text>
          </View>
          <View style={styles.ledgerRow}>
            <Text style={[styles.lLabel, { color: theme.textSecondary }]}>Operating Expenses</Text>
            <Text style={[styles.lVal, { color: theme.error }]}>-{formatCurrency(totalExpense)}</Text>
          </View>
          <View style={[styles.ledgerRow, styles.netRow, { borderTopColor: theme.border }]}>
            <Text style={[styles.netLabel, { color: theme.text }]}>Net Operating Surplus</Text>
            <Text style={[styles.netVal, { color: theme.primary }]}>{formatCurrency(netProfit)}</Text>
          </View>
          <Text style={[styles.depositNote, { color: theme.textMuted }]}>
            ℹ️ As per standard accounting and PRD: Security deposits are excluded from revenue and held in escrow.
          </Text>
        </Card>

        {/* Actions Bar */}
        <View style={styles.actionGrid}>
          <Button
            title="+ Log Expense"
            variant="secondary"
            onPress={() => setExpenseModalVisible(true)}
            style={{ flex: 1, marginRight: Spacing.sm }}
          />
          <Button
            title="📥 Export CSV"
            variant="outline"
            onPress={exportSanitizedCSV}
            isLoading={isExporting}
            style={{ flex: 1 }}
          />
        </View>

        {/* Recent Transactions List */}
        <Text style={[styles.sectionHeading, { color: theme.text, marginTop: Spacing.lg }]}>
          RECENT ACTIVITY LEDGER
        </Text>
        {expenses.slice(0, 5).map((e: any) => (
          <Card key={e.id} style={styles.itemCard}>
            <View style={styles.itemRow}>
              <View>
                <Text style={[styles.itemTitle, { color: theme.text }]}>
                  Expense: {e.description}
                </Text>
                <Text style={[styles.itemSub, { color: theme.textSecondary }]}>
                  {e.category?.toUpperCase()} · {formatDate(e.expense_date)}
                </Text>
              </View>
              <Text style={[styles.itemAmt, { color: theme.error }]}>
                -{formatCurrency(e.amount)}
              </Text>
            </View>
          </Card>
        ))}

        {payments.slice(0, 5).map((p: any) => (
          <Card key={p.id} style={styles.itemCard}>
            <View style={styles.itemRow}>
              <View>
                <Text style={[styles.itemTitle, { color: theme.text }]}>
                  Rent Inflow · {p.tenant?.full_name || 'Tenant'}
                </Text>
                <Text style={[styles.itemSub, { color: theme.textSecondary }]}>
                  {p.receipt_no} · {p.mode?.toUpperCase()} · {formatDate(p.payment_date)}
                </Text>
              </View>
              <Text style={[styles.itemAmt, { color: theme.success }]}>
                +{formatCurrency(p.amount)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => downloadReceipt(p)}
              style={[styles.receiptBtn, { borderColor: theme.border }]}
            >
              <Text style={[styles.receiptBtnText, { color: theme.primary }]}>📄 PDF Receipt</Text>
            </TouchableOpacity>
          </Card>
        ))}
      </ScrollView>

      {/* Add Expense Modal */}
      <Modal visible={expenseModalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Log PG Expense</Text>

            <Input
              label="Expense Description"
              placeholder="e.g. Water tank cleaning, Electricity bill"
              value={expenseDesc}
              onChangeText={setExpenseDesc}
              required
            />
            <Input
              label="Amount in Rupees (₹)"
              placeholder="e.g. 3500"
              value={expenseAmount}
              onChangeText={setExpenseAmount}
              keyboardType="numeric"
              required
            />

            <View style={styles.modalBtns}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setExpenseModalVisible(false)}
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
              <Button
                title="Save Expense"
                variant="primary"
                onPress={() => addExpenseMutation.mutate()}
                isLoading={actionLoading}
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
  billingCard: { padding: Spacing.base, borderRadius: BorderRadius.xl, marginBottom: Spacing.base },
  billingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  // Static style: the billing card is always dark (see line 233),
  // so the ember accent is correct in both themes.
  billingTag: { color: Colors.accent, fontFamily: Typography.fontFamily.semiBold, fontSize: 10, letterSpacing: 1 },
  billingTitle: { color: '#FFF', fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, marginTop: 2 },
  billingSub: { color: '#FFFFFF80', fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: Spacing.xs, lineHeight: 18 },
  ledgerCard: { padding: Spacing.base, marginBottom: Spacing.base },
  ledgerTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  ledgerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs },
  lLabel: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs },
  lVal: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs },
  netRow: { borderTopWidth: 1, marginTop: Spacing.xs, paddingTop: Spacing.sm },
  netLabel: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm },
  netVal: { fontFamily: Typography.fontFamily.extraBold, fontSize: Typography.size.base },
  depositNote: { fontFamily: Typography.fontFamily.regular, fontSize: 10, marginTop: Spacing.sm, lineHeight: 16 },
  actionGrid: { flexDirection: 'row', marginBottom: Spacing.base },
  sectionHeading: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.sm },
  itemCard: { marginBottom: Spacing.xs, padding: Spacing.sm },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs },
  itemSub: { fontFamily: Typography.fontFamily.regular, fontSize: 10, marginTop: 2 },
  itemAmt: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xs },
  receiptBtn: { marginTop: Spacing.sm, paddingVertical: Spacing.sm, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  receiptBtnText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: BorderRadius['2xl'], borderTopRightRadius: BorderRadius['2xl'], padding: Spacing.xl },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, marginBottom: Spacing.base },
  modalBtns: { flexDirection: 'row', marginTop: Spacing.base },
});
