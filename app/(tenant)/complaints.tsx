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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { supabase, uploadFile } from '../../src/lib/supabase';
import {
  Colors,
  Typography,
  Spacing,
  BorderRadius,
  COMPLAINT_CATEGORIES,
  MAX_IMAGE_SIZE_BYTES,
  IMAGE_COMPRESS_QUALITY,
} from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatDate } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';

export default function TenantComplaintsScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(COMPLAINT_CATEGORIES[0].value);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['tenant-complaints', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id, property_id, current_tenancy:tenancies!inner(room_id)')
        .eq('user_id', user.id)
        .eq('tenancies.status', 'active')
        .maybeSingle();

      if (!tenant) return null;

      const { data: complaints } = await supabase
        .from('complaints')
        .select('*, complaint_comments(*, author:profiles(full_name))')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });

      return { tenant, complaints: complaints || [] };
    },
    enabled: !!user,
  });

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: IMAGE_COMPRESS_QUALITY,
    });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE_BYTES) {
        Alert.alert('Too Large', 'Image must be under 2MB.');
        return;
      }
      setPhotoUri(asset.uri);
    }
  };

  const createComplaintMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Please enter a title');
      if (!data?.tenant) throw new Error('Tenant record not found');
      setIsSubmitting(true);

      let photoPath: string | null = null;
      if (photoUri) {
        photoPath = `${data.tenant.id}/complaint_${Date.now()}.jpg`;
        await uploadFile('complaint_photos', photoPath, {
          uri: photoUri,
          name: `complaint_${Date.now()}.jpg`,
          type: 'image/jpeg',
        });
      }

      const tenancy = (data.tenant.current_tenancy as any)?.[0];
      const { error } = await supabase.from('complaints').insert({
        tenant_id: data.tenant.id,
        property_id: data.tenant.property_id,
        room_id: tenancy?.room_id || null,
        category: selectedCategory,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        photo_url: photoPath,
        status: 'open',
      });

      if (error) throw error;
    },
    onSuccess: () => {
      setIsSubmitting(false);
      setModalVisible(false);
      setTitle('');
      setDescription('');
      setPhotoUri(null);
      queryClient.invalidateQueries({ queryKey: ['tenant-complaints'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-dashboard'] });
      Alert.alert('Ticket Raised', 'Your complaint ticket has been submitted to the warden.');
    },
    onError: (err: any) => {
      setIsSubmitting(false);
      Alert.alert('Error', err.message || 'Failed to submit complaint');
    },
  });

  if (isLoading) return <LoadingView message="Loading complaints..." />;

  const complaints = data?.complaints || [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Maintenance & Complaints"
        subtitle="Report issues directly to your PG warden"
        right={
          <Button
            title="+ New"
            size="sm"
            fullWidth={false}
            onPress={() => setModalVisible(true)}
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={Colors.primary} />}
      >
        {complaints.length === 0 ? (
          <EmptyState
            icon="🛠️"
            title="No Complaints"
            description="Have a problem with water, electricity, or cleaning? Raise a ticket and the warden will resolve it."
            action={{ label: 'Raise a Complaint', onPress: () => setModalVisible(true) }}
          />
        ) : (
          complaints.map((c: any) => (
            <Card key={c.id} style={styles.complaintCard}>
              <View style={styles.complaintHeader}>
                <View style={{ flex: 1, marginRight: Spacing.sm }}>
                  <Text style={[styles.complaintTitle, { color: theme.text }]}>{c.title}</Text>
                  <Text style={[styles.complaintMeta, { color: theme.textSecondary }]}>
                    Category: {c.category?.toUpperCase()} · {formatDate(c.created_at)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge label={c.status} status={c.status} />
                  <Badge label={c.priority} status={c.priority} size="sm" />
                </View>
              </View>

              {c.description ? (
                <Text style={[styles.complaintDesc, { color: theme.textSecondary }]}>
                  {c.description}
                </Text>
              ) : null}

              {c.resolution_note ? (
                <View style={[styles.resolutionBox, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: theme.border }]}>
                  <Text style={[styles.resolutionTitle, { color: Colors.success }]}>✓ Resolution Note:</Text>
                  <Text style={[styles.resolutionText, { color: theme.textSecondary }]}>{c.resolution_note}</Text>
                </View>
              ) : null}
            </Card>
          ))
        )}
      </ScrollView>

      {/* New Complaint Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>New Maintenance Ticket</Text>

            {/* Category selection */}
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Issue Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
              {COMPLAINT_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  onPress={() => setSelectedCategory(cat.value)}
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: selectedCategory === cat.value ? Colors.primary : theme.surfaceAlt,
                      borderColor: selectedCategory === cat.value ? Colors.primary : theme.border,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 14 }}>{cat.icon}</Text>
                  <Text
                    style={[
                      styles.catText,
                      { color: selectedCategory === cat.value ? '#FFF' : theme.text },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Input
              label="Issue Summary"
              placeholder="e.g. Geyser not working in bathroom"
              value={title}
              onChangeText={setTitle}
              required
            />

            <Input
              label="Description & Room Details"
              placeholder="Explain the issue in detail..."
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              style={{ minHeight: 70 }}
            />

            {/* Photo Attachment */}
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Attach Photo (Optional &lt;2MB)</Text>
            <TouchableOpacity
              onPress={pickImage}
              style={[
                styles.photoBox,
                { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
              ]}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
              ) : (
                <Text style={[styles.photoPrompt, { color: theme.textMuted }]}>
                  📷 Tap to pick or take photo
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.modalBtns}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setModalVisible(false)}
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
              <Button
                title="Submit Ticket"
                variant="primary"
                onPress={() => createComplaintMutation.mutate()}
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
  complaintCard: { marginBottom: Spacing.md, padding: Spacing.base },
  complaintHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  complaintTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base },
  complaintMeta: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  complaintDesc: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, marginTop: Spacing.sm, lineHeight: 20 },
  resolutionBox: { marginTop: Spacing.sm, padding: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1 },
  resolutionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs },
  resolutionText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: BorderRadius['2xl'], borderTopRightRadius: BorderRadius['2xl'], padding: Spacing.xl },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, marginBottom: Spacing.base },
  inputLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, marginBottom: Spacing.xs },
  catScroll: { marginBottom: Spacing.base, maxHeight: 44 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full, borderWidth: 1, marginRight: Spacing.xs },
  catText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs },
  photoBox: { height: 90, borderRadius: BorderRadius.lg, borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.base, overflow: 'hidden' },
  photoPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoPrompt: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs },
  modalBtns: { flexDirection: 'row', marginTop: Spacing.xs },
});
