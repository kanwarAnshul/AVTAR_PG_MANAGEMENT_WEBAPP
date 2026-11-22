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
import { supabase } from '../../src/lib/supabase';
import { generateAndShareReceipt } from '../../src/services/receipt';
import { Colors, Typography, Spacing, BorderRadius, PAYMENT_MODES } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatCurrency, formatDate, generateReceiptNo } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';

export default function WardenDuesScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user, profile } = useAuthStore();
  const queryClient = useQueryClient();

  const [collectModalVisible, setCollectModalVisible] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [paymentMode, setPaymentMode] = useState<string>('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const { data: dues = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['warden-dues-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          property:properties(name),
          tenant:tenants(
            id, full_name, phone, category,
            tenancy:tenancies!inner(room:rooms(room_no), bed:beds(label))
          )
        `)
        .in('status', ['sent', 'partial', 'overdue'])
        .order('due_date', { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInvoice) throw new Error('No invoice selected');
      setActionLoading(true);

      const amountPaise = selectedInvoice.balance_due;
      const receiptNo = generateReceiptNo();

      // 1. Insert payment record
      const { data: payment, error: pError } = await supabase
        .from('payments')
        .insert({
          tenant_id: selectedInvoice.tenant_id,
          property_id: selectedInvoice.property_id,
          amount: amountPaise,
          mode: paymentMode,
          reference_no: referenceNo || null,
          receipt_no: receiptNo,
          received_by: user?.id,
          notes: `Collected by Warden (${paymentMode.toUpperCase()})`,
        })
        .select()
        .single();

      if (pError) throw pError;

      // 2. Allocate payment to invoice (trigger updates invoice status to 'paid')
      const { error: aError } = await supabase
        .from('payment_allocations')
        .insert({
          payment_id: payment.id,
          invoice_id: selectedInvoice.id,
          amount: amountPaise,
        });

      if (aError) throw aError;

      const receiptInvoice = {
        ...selectedInvoice,
        paid_amount: (selectedInvoice.paid_amount || 0) + amountPaise,
        balance_due: Math.max(0, (selectedInvoice.balance_due || 0) - amountPaise),
      };
      return {
        payment,
        invoice: receiptInvoice,
        tenant: selectedInvoice.tenant,
        propertyName: selectedInvoice.property?.name,
      };
    },
    onSuccess: async ({ payment, invoice, tenant, propertyName }) => {
      setActionLoading(false);
      setCollectModalVisible(false);
      setSelectedInvoice(null);
      setReferenceNo('');
      queryClient.invalidateQueries({ queryKey: ['warden-dues-list'] });
      queryClient.invalidateQueries({ queryKey: ['warden-dashboard-stats'] });
      Alert.alert(
        'Payment Recorded',
        'Invoice marked paid. Your PDF receipt will open next — hand it to the tenant or save it for the office.',
        [
          {
            text: 'OK',
            onPress: async () => {
              try {
                await generateAndShareReceipt({
                  payment,
                  invoice,
                  tenant,
                  propertyName,
                  collectedBy: profile?.full_name || 'Warden',
                });
              } catch {
                Alert.alert('Receipt', 'The PDF could not open right now. The payment has been recorded successfully.');
              }
            },
          },
        ]
      );
    },
    onError: (err: any) => {
      setActionLoading(false);
      Alert.alert('Error', err.message || 'Payment confirmation failed');
    },
  });

  if (isLoading) return <LoadingView message="Loading outstanding dues..." />;

  const totalOutstanding = dues.reduce((acc: number, d: any) => acc + (d.balance_due || 0), 0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Rent Dues & Collections"
        subtitle={`Total Outstanding: ${formatCurrency(totalOutstanding)}`}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={theme.primary} />}
      >
        {dues.length === 0 ? (
          <EmptyState
            icon="🎉"
            title="Zero Pending Dues"
            description="All active tenants have cleared their monthly PG rent on time."
          />
        ) : (
          dues.map((item: any) => {
            const tenancy = (item.tenant?.tenancy as any)?.[0];
            return (
              <Card key={item.id} style={styles.card}>
                <View style={styles.headerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: theme.text }]}>
                      {item.tenant?.full_name}
                    </Text>
                    <Text style={[styles.meta, { color: theme.textSecondary }]}>
                      Room {tenancy?.room?.room_no || 'N/A'} · Bed {tenancy?.bed?.label || 'N/A'} · {item.tenant?.phone || 'No phone'}
                    </Text>
                    <Text style={[styles.period, { color: theme.textMuted }]}>
                      Period: {item.billing_period} · Due {formatDate(item.due_date)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[styles.dueAmount, { color: theme.error }]}>
                      {formatCurrency(item.balance_due)}
                    </Text>
                    <Badge label={item.status} status={item.status} size="sm" />
                  </View>
                </View>

                <View style={[styles.actionsRow, { borderTopColor: theme.border }]}>
                  <Button
                    title="Confirm Cash / UPI Payment"
                    size="sm"
                    variant="primary"
                    onPress={() => {
                      setSelectedInvoice(item);
                      setCollectModalVisible(true);
                    }}
                  />
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* Collect Payment Modal */}
      <Modal visible={collectModalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Record Collection</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              Tenant: {selectedInvoice?.tenant?.full_name} · Period: {selectedInvoice?.billing_period}
            </Text>

            <View style={[styles.amountBox, { backgroundColor: theme.surfaceAlt }]}>
              <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>Collected Amount</Text>
              <Text style={[styles.amountDisplay, { color: theme.success }]}>
                {selectedInvoice ? formatCurrency(selectedInvoice.balance_due) : ''}
              </Text>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Payment Received Via</Text>
            <View style={styles.modeRow}>
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
                  <Text style={[styles.modeTxt, { color: paymentMode === m.value ? '#FFF' : theme.text }]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Input
              label="Transaction / UPI Reference (Optional)"
              placeholder="e.g. UPI Ref / Cash memo"
              value={referenceNo}
              onChangeText={setReferenceNo}
            />

            <View style={styles.modalBtns}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setCollectModalVisible(false)}
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
              <Button
                title="Confirm & Issue Receipt"
                variant="primary"
                onPress={() => confirmPaymentMutation.mutate()}
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
  card: { marginBottom: Spacing.md, padding: Spacing.base },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  meta: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  period: { fontFamily: Typography.fontFamily.regular, fontSize: 11, marginTop: 2 },
  dueAmount: { fontFamily: Typography.fontFamily.extraBold, fontSize: Typography.size.base },
  actionsRow: { marginTop: Spacing.sm, borderTopWidth: 1, paddingTop: Spacing.xs },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: BorderRadius['2xl'], borderTopRightRadius: BorderRadius['2xl'], padding: Spacing.xl },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl },
  modalSub: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginBottom: Spacing.base },
  amountBox: { padding: Spacing.base, borderRadius: BorderRadius.lg, alignItems: 'center', marginBottom: Spacing.base },
  amountLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs },
  amountDisplay: { fontFamily: Typography.fontFamily.extraBold, fontSize: Typography.size['2xl'], marginTop: 4 },
  inputLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, marginBottom: Spacing.xs },
  modeRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.base },
  modeBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1, alignItems: 'center', gap: 2 },
  modeTxt: { fontFamily: Typography.fontFamily.medium, fontSize: 11 },
  modalBtns: { flexDirection: 'row', marginTop: Spacing.sm },
});
