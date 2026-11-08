import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/theme';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { supabase, uploadFile, isSupabaseConfigured } from '../lib/supabase';
import { friendlyDbError } from '../utils/helpers';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Image } from 'react-native';

interface ProfileEditorProps {
  /** Tenants get a one-time profile: only password + photo remain editable. */
  tenantMode?: boolean;
}

export const ProfileEditor: React.FC<ProfileEditorProps> = ({ tenantMode = false }) => {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const { user, profile, refreshProfile } = useAuthStore();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(profile?.avatar_url ?? null);
  const [saving, setSaving] = useState(false);

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });
    if (!res.canceled && res.assets[0]) setPhotoUri(res.assets[0].uri);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      let avatarUrl = profile?.avatar_url ?? null;
      if (photoUri && photoUri.startsWith('file')) {
        const path = `${user.id}/avatar_${Date.now()}.jpg`;
        await uploadFile('tenant_docs', path, { uri: photoUri, name: `avatar_${Date.now()}.jpg`, type: 'image/jpeg' });
        avatarUrl = path;
      }

      if (isSupabaseConfigured) {
        // Tenants: only photo (+ password via auth) — name/phone locked.
        const patch: Record<string, unknown> = tenantMode
          ? { avatar_url: avatarUrl, updated_at: new Date().toISOString() }
          : {
              full_name: fullName.trim() || profile?.full_name,
              phone: phone.trim() || profile?.phone,
              avatar_url: avatarUrl,
              updated_at: new Date().toISOString(),
            };
        const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
        if (error) throw new Error(friendlyDbError(error));
      }

      if (newPassword.trim()) {
        if (newPassword.trim().length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        if (isSupabaseConfigured) {
          const { error: pwError } = await supabase.auth.updateUser({ password: newPassword.trim() });
          if (pwError) throw new Error(friendlyDbError(pwError));
        }
        setNewPassword('');
      }

      await refreshProfile();
      Alert.alert('Profile Updated', 'Your changes were saved successfully.');
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message ?? 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      {/* Photo */}
      <Card style={styles.card}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>PROFILE PHOTO</Text>
        <View style={styles.photoRow}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: Colors.primary }]}>
              <Text style={styles.avatarLetter}>
                {(profile?.full_name ?? profile?.email ?? 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Button
            title="Change Photo"
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={pickPhoto}
          />
        </View>
      </Card>

      {/* Details */}
      <Card style={styles.card}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {tenantMode ? 'ACCOUNT (LOCKED AFTER CREATION)' : 'ACCOUNT DETAILS'}
        </Text>
        {!tenantMode ? (
          <>
            <Input label="Full Name" value={fullName} onChangeText={setFullName} placeholder="Your full name" required />
            <Input
              label="Phone Number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="10-digit mobile number"
            />
          </>
        ) : (
          <Text style={[styles.lockNote, { color: theme.textSecondary }]}>
            🔒 Your tenant profile was set at registration. Only your photo and password can be changed.
            Contact the warden for other corrections.
          </Text>
        )}
        <Input
          label="New Password (leave blank to keep current)"
          value={newPassword}
          onChangeText={setNewPassword}
          isPassword
          placeholder="Minimum 6 characters"
        />
        <Text style={[styles.emailNote, { color: theme.textMuted }]}>
          Login email: {profile?.email ?? user?.email} (managed by sign-in — contact owner to change)
        </Text>
        <Button title="Save Profile" onPress={save} isLoading={saving} style={{ marginTop: Spacing.sm }} />
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { padding: Spacing.base, marginBottom: Spacing.base },
  sectionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, letterSpacing: 1, marginBottom: Spacing.md },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#FFF', fontFamily: Typography.fontFamily.bold, fontSize: 28 },
  lockNote: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, lineHeight: 20, marginBottom: Spacing.sm },
  emailNote: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginTop: 2 },
});

export default ProfileEditor;
