import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { supabase, isSupabaseConfigured } from '../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useThemeStore } from '../../src/stores/themeStore';
import { useAuthStore } from '../../src/stores/authStore';
import { formatCurrency, friendlyDbError } from '../../src/utils/helpers';
import { Card } from '../../src/components/ui/Card';
import { Badge } from '../../src/components/ui/Badge';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { ScreenHeader, EmptyState, LoadingView } from '../../src/components/ui';

const BHK_OPTIONS = ['studio', '1bhk', '2bhk', '3bhk', 'other'] as const;

export default function OwnerRoomsScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [modalVisible, setModalVisible] = useState(false);
  const [roomNo, setRoomNo] = useState('');
  const [floor, setFloor] = useState('0');
  const [sharing, setSharing] = useState('2');
  const [bhk, setBhk] = useState<string>('1bhk');
  const [location, setLocation] = useState('');
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // First-run property setup (a room must belong to a property)
  const [propertyModalVisible, setPropertyModalVisible] = useState(false);
  const [propertyName, setPropertyName] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [propertyCity, setPropertyCity] = useState('');
  const [propertySaving, setPropertySaving] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['owner-rooms-list'],
    queryFn: async () => {
      const { data: properties } = await supabase.from('properties').select('id, name, address');
      const { data: rooms } = await supabase
        .from('rooms')
        .select('*')
        .order('room_no', { ascending: true });
      const { data: beds } = await supabase.from('beds').select('id, room_id');
      return { properties: properties || [], rooms: rooms || [], beds: beds || [] };
    },
  });

  const pickPhotos = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.6,
    });
    if (!res.canceled) setPhotos(res.assets.map((a) => a.uri));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!roomNo.trim()) throw new Error('Room number is required');
      if (!rent.trim()) throw new Error('Monthly rent is required');
      setSaving(true);
      const propertyId = data?.properties?.[0]?.id;
      if (!propertyId) throw new Error('No property found. Create a property first.');

      const { data: room, error } = await supabase
        .from('rooms')
        .insert({
          property_id: propertyId,
          room_no: roomNo.trim(),
          floor: parseInt(floor, 10) || 0,
          sharing_type: parseInt(sharing, 10) || 1,
          monthly_rent: Math.round(parseFloat(rent) * 100),
          deposit_amt: Math.round((parseFloat(deposit) || 0) * 100),
          category: bhk,
          location: location.trim() || null,
          photo_urls: photos.length ? photos : [],
          video_urls: [],
        } as any)
        .select()
        .single();
      if (error) throw new Error(friendlyDbError(error));

      // Auto-create beds for sharing type.
      const bedCount = parseInt(sharing, 10) || 1;
      const bedRows = Array.from({ length: bedCount }, (_, i) => ({
        room_id: (room as any).id,
        label: `Bed ${i + 1}`,
        status: 'available' as const,
      }));
      const { error: bedError } = await supabase.from('beds').insert(bedRows);
      if (bedError) throw new Error(friendlyDbError(bedError));

      try {
        await supabase.from('audit_events').insert({
          actor_id: user?.id,
          action: 'OWNER_ADD_ROOM',
          table_name: 'rooms',
          record_id: (room as any).id,
        });
      } catch { /* non-fatal audit */ }
    },
    onSuccess: () => {
      setSaving(false);
      setModalVisible(false);
      setRoomNo('');
      setFloor('0');
      setSharing('2');
      setLocation('');
      setRent('');
      setDeposit('');
      setPhotos([]);
      queryClient.invalidateQueries({ queryKey: ['owner-rooms-list'] });
      queryClient.invalidateQueries({ queryKey: ['owner-overall-stats'] });
      Alert.alert('Room Added', 'Room and its beds are now live for allocation.');
    },
    onError: (err: any) => {
      setSaving(false);
      Alert.alert('Save Failed', err?.message ?? 'Could not add room');
    },
  });

  const createPropertyMutation = useMutation({
    mutationFn: async () => {
      if (!propertyName.trim() || !propertyAddress.trim()) {
        throw new Error('Property name and address are required');
      }
      if (!user?.id) throw new Error('You must be signed in as the Super Admin.');
      setPropertySaving(true);

      const { error } = await supabase.from('properties').insert({
        owner_id: user.id,
        name: propertyName.trim(),
        address: propertyAddress.trim(),
        city: propertyCity.trim() || null,
      } as any);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      setPropertySaving(false);
      setPropertyModalVisible(false);
      setPropertyName('');
      setPropertyAddress('');
      setPropertyCity('');
      queryClient.invalidateQueries({ queryKey: ['owner-rooms-list'] });
      queryClient.invalidateQueries({ queryKey: ['owner-overall-stats'] });
      Alert.alert('Property Created', 'Now add rooms to this property.');
    },
    onError: (err: any) => {
      setPropertySaving(false);
      Alert.alert('Property Setup Failed', err?.message ?? 'Could not create property');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (room: any) => {
      const { error } = await supabase
        .from('rooms')
        .update({ is_active: !room.is_active })
        .eq('id', room.id);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner-rooms-list'] }),
    onError: (err: any) => Alert.alert('Error', err?.message ?? 'Could not update room'),
  });

  if (isLoading) return <LoadingView message="Loading rooms inventory..." />;

  const rooms = data?.rooms || [];
  const beds = data?.beds || [];
  const bedsByRoom = (roomId: string) => beds.filter((b: any) => b.room_id === roomId).length;

  const properties = data?.properties || [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Rooms & Inventory"
        subtitle={`${properties.length} ${properties.length === 1 ? 'property' : 'properties'} · ${rooms.length} rooms`}
        right={
          <View style={styles.headerBtns}>
            <Button
              title="+ Property"
              size="sm"
              fullWidth={false}
              variant="secondary"
              onPress={() => setPropertyModalVisible(true)}
            />
            <Button
              title="+ Add Room"
              size="sm"
              fullWidth={false}
              onPress={() => {
                if (properties.length === 0) {
                  Alert.alert('Create a property first', 'Rooms must belong to a property. Set one up now.', [
                    { text: 'Later', style: 'cancel' },
                    { text: 'Create Property', onPress: () => setPropertyModalVisible(true) },
                  ]);
                  return;
                }
                setModalVisible(true);
              }}
            />
          </View>
        }
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={Colors.primary} />}
      >
        {properties.length === 0 ? (
          <EmptyState
            icon="🏢"
            title="Set Up Your Property"
            description="Every room belongs to a property. Create your PG/hostel property first, then add rooms, beds and photos."
            action={{ label: 'Create Property', onPress: () => setPropertyModalVisible(true) }}
          />
        ) : rooms.length === 0 ? (
          <EmptyState
            icon="🏠"
            title="No Rooms Yet"
            description="Add your first room with BHK, rent, location and photos."
            action={{ label: 'Add First Room', onPress: () => setModalVisible(true) }}
          />
        ) : (
          rooms.map((room: any) => (
            <Card key={room.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.roomNo, { color: theme.text }]}>
                    Room {room.room_no} · {room.category?.toUpperCase() || 'ROOM'}
                  </Text>
                  <Text style={[styles.meta, { color: theme.textSecondary }]}>
                    Floor {room.floor} · {room.sharing_type} sharing · {bedsByRoom(room.id)} beds
                    {room.location ? ` · 📍 ${room.location}` : ''}
                  </Text>
                  <Text style={[styles.meta, { color: Colors.primary }]}>
                    {formatCurrency(room.monthly_rent)}/mo · Deposit {formatCurrency(room.deposit_amt || 0)}
                  </Text>
                </View>
                <Badge
                  label={room.is_active ? 'Available' : 'Not Available'}
                  status={room.is_active ? 'approved' : 'rejected'}
                  size="sm"
                />
              </View>
              {room.photo_urls?.length ? (
                <Text style={[styles.meta, { color: theme.textMuted }]}>
                  📷 {room.photo_urls.length} photo(s) · 🎬 {(room.video_urls || []).length} video(s)
                </Text>
              ) : null}
              <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                <Button
                  title={room.is_active ? 'Mark Not Available' : 'Mark Available'}
                  size="sm"
                  fullWidth={false}
                  variant={room.is_active ? 'outline' : 'primary'}
                  onPress={() => toggleActiveMutation.mutate(room)}
                />
              </View>
            </Card>
          ))
        )}
        {!isSupabaseConfigured && (
          <Text style={[styles.demoNote, { color: theme.textMuted }]}>Live data: rooms load directly from your Supabase database.</Text>
        )}
      </ScrollView>

      <Modal visible={propertyModalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Create Property</Text>
            <Text style={[styles.videoNote, { color: theme.textSecondary, marginBottom: Spacing.sm }]}>
              This is your PG/hostel building. Rooms, beds, wardens and tenants are all linked to it.
            </Text>
            <Input
              label="Property Name"
              value={propertyName}
              onChangeText={setPropertyName}
              placeholder="e.g. Avtar Singh PG — Sector 15"
              required
            />
            <Input
              label="Full Address"
              value={propertyAddress}
              onChangeText={setPropertyAddress}
              placeholder="Street, area, landmark"
              required
            />
            <Input
              label="City"
              value={propertyCity}
              onChangeText={setPropertyCity}
              placeholder="e.g. Chandigarh"
            />
            <View style={styles.modalBtns}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setPropertyModalVisible(false)}
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
              <Button
                title="Create Property"
                variant="primary"
                onPress={() => createPropertyMutation.mutate()}
                isLoading={propertySaving}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Available Room for Rent</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Input label="Room No." value={roomNo} onChangeText={setRoomNo} placeholder="e.g. A-101" required />
              <View style={styles.twoCol}>
                <Input label="Floor" value={floor} onChangeText={setFloor} keyboardType="numeric" containerStyle={{ flex: 1 }} />
                <Input label="Sharing" value={sharing} onChangeText={setSharing} keyboardType="numeric" containerStyle={{ flex: 1 }} />
              </View>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Category (BHK)</Text>
              <View style={styles.chipRow}>
                {BHK_OPTIONS.map((opt) => (
                  <Button
                    key={opt}
                    title={opt.toUpperCase()}
                    size="sm"
                    fullWidth={false}
                    variant={bhk === opt ? 'primary' : 'secondary'}
                    onPress={() => setBhk(opt)}
                  />
                ))}
              </View>
              <Input label="Location / Nearby" value={location} onChangeText={setLocation} placeholder="e.g. Near Gate 2, Sector 15" />
              <View style={styles.twoCol}>
                <Input label="Rent ₹/month" value={rent} onChangeText={setRent} keyboardType="numeric" required containerStyle={{ flex: 1 }} />
                <Input label="Deposit ₹" value={deposit} onChangeText={setDeposit} keyboardType="numeric" containerStyle={{ flex: 1 }} />
              </View>
              <Button
                title={photos.length ? `📷 ${photos.length} photo(s) picked — Add More` : '📷 Pick Room Photos'}
                variant="secondary"
                onPress={pickPhotos}
                style={{ marginTop: Spacing.xs }}
              />
              <Text style={[styles.videoNote, { color: theme.textMuted }]}>
                🎬 Video uploads can be attached after saving from the room detail — photos are stored for tenant viewing.
              </Text>
            </ScrollView>
            <View style={styles.modalBtns}>
              <Button title="Cancel" variant="secondary" onPress={() => setModalVisible(false)} style={{ flex: 1, marginRight: Spacing.sm }} />
              <Button title="Add Room" variant="primary" onPress={() => createMutation.mutate()} isLoading={saving} style={{ flex: 1 }} />
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
  headerBtns: { flexDirection: 'row', gap: Spacing.xs },
  card: { padding: Spacing.base, marginBottom: Spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  roomNo: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
  meta: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
  cardFooter: { marginTop: Spacing.sm, borderTopWidth: 1, paddingTop: Spacing.sm },
  demoNote: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, textAlign: 'center', marginTop: Spacing.sm },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: BorderRadius['2xl'], borderTopRightRadius: BorderRadius['2xl'], padding: Spacing.xl, maxHeight: '88%' },
  modalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, marginBottom: Spacing.base },
  twoCol: { flexDirection: 'row', gap: Spacing.sm },
  inputLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, marginBottom: Spacing.xs },
  chipRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.sm },
  videoNote: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: Spacing.xs, lineHeight: 16 },
  modalBtns: { flexDirection: 'row', marginTop: Spacing.base },
});
