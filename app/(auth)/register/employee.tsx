import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, Image,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import { supabase, uploadFile } from '../../../src/lib/supabase';
import { Colors, Typography, Spacing, BorderRadius, MAX_IMAGE_SIZE_BYTES, IMAGE_COMPRESS_QUALITY } from '../../../src/constants/theme';
import { PAN_REGEX, friendlyDbError } from '../../../src/utils/helpers';
import { useThemeStore } from '../../../src/stores/themeStore';
import { Button } from '../../../src/components/ui/Button';
import { Input } from '../../../src/components/ui/Input';
import { Card } from '../../../src/components/ui/Card';

// Re-export PAN_REGEX from helpers
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const schema = z.object({
  full_name: z.string().min(2, 'Enter full name'),
  email: z.string().email('Enter valid email'),
  password: z.string().min(8, 'Minimum 8 characters'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter valid 10-digit phone'),
  company_name: z.string().min(2, 'Enter company name'),
  employee_id: z.string().min(1, 'Enter employee ID'),
  work_email: z.string().email('Enter valid work email'),
  designation: z.string().min(2, 'Enter designation'),
  permanent_address: z.string().min(10, 'Enter full address'),
  family_contact_name: z.string().min(2, 'Enter family contact name'),
  family_contact_phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter valid phone'),
  family_relation: z.string().min(2, 'Enter relation'),
  pan_number: z.string().regex(PAN_PATTERN, 'Invalid PAN format: AAAAA9999A'),
});

type FormData = z.infer<typeof schema>;

interface DocState { uri?: string; name?: string; type?: string; }

export default function EmployeeRegisterScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [photo, setPhoto] = useState<DocState>({});
  const [aadhaarFront, setAadhaarFront] = useState<DocState>({});
  const [aadhaarBack, setAadhaarBack] = useState<DocState>({});
  const [formError, setFormError] = useState('');

  const { control, handleSubmit, formState: { errors }, trigger } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const pickImage = async (docType: 'photo' | 'aadhaarFront' | 'aadhaarBack') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: IMAGE_COMPRESS_QUALITY,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE_BYTES) {
        Alert.alert('File Too Large', 'Image must be under 2MB.');
        return;
      }
      const doc: DocState = { uri: asset.uri, name: asset.fileName ?? `${docType}.jpg`, type: asset.mimeType ?? 'image/jpeg' };
      if (docType === 'photo') setPhoto(doc);
      else if (docType === 'aadhaarFront') setAadhaarFront(doc);
      else setAadhaarBack(doc);
    }
  };

  const handleNext = async () => {
    let fields: (keyof FormData)[] = [];
    if (step === 1) fields = ['full_name', 'email', 'password', 'phone'];
    else if (step === 2) fields = ['company_name', 'employee_id', 'work_email', 'designation', 'permanent_address', 'family_contact_name', 'family_contact_phone', 'family_relation'];
    const valid = await trigger(fields);
    if (valid) setStep(step + 1);
  };

  const onSubmit = async (data: FormData) => {
    if (!photo.uri) { Alert.alert('Required', 'Upload your photo'); return; }
    if (!aadhaarFront.uri || !aadhaarBack.uri) { Alert.alert('Required', 'Upload both Aadhaar images'); return; }
    setIsLoading(true);
    setFormError('');
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email.toLowerCase().trim(),
        password: data.password,
        options: { data: { role: 'tenant', full_name: data.full_name, phone: data.phone } },
      });
      if (authError || !authData.user) throw authError ?? new Error('Signup failed');

      // Document uploads need an authenticated session. When Supabase email
      // confirmation is enabled, signUp() returns a user but NO session, and
      // storage would reject the upload with an RLS error.
      if (!authData.session) {
        setFormError(
          'Account created. This project requires email confirmation, so documents cannot be uploaded yet. Confirm your email, sign in, then submit the documents again. Recommended: turn off "Confirm email" in Supabase → Authentication → Providers → Email.'
        );
        return;
      }

      const uid = authData.user.id;

      await uploadFile('tenant_docs', `${uid}/photo.jpg`, photo as any);
      await uploadFile('tenant_docs', `${uid}/aadhaar_front.jpg`, aadhaarFront as any);
      await uploadFile('tenant_docs', `${uid}/aadhaar_back.jpg`, aadhaarBack as any);

      // Encrypt PAN via RPC (pgcrypto). Never store PAN in plain text.
      const { data: encPAN, error: panError } = await supabase.rpc('encrypt_pan', {
        pan_text: data.pan_number.toUpperCase(),
      });
      if (panError) throw panError;

      const { error: regError } = await supabase.from('tenant_registrations').insert({
        user_id: uid,
        category: 'employee',
        full_name: data.full_name,
        phone: data.phone,
        company_name: data.company_name,
        employee_id: data.employee_id,
        work_email: data.work_email,
        designation: data.designation,
        permanent_address: data.permanent_address,
        family_contact_name: data.family_contact_name,
        family_contact_phone: data.family_contact_phone,
        family_relation: data.family_relation,
        photo_url: `${uid}/photo.jpg`,
        aadhaar_front_url: `${uid}/aadhaar_front.jpg`,
        aadhaar_back_url: `${uid}/aadhaar_back.jpg`,
        pan_encrypted: encPAN,
        status: 'pending',
      });
      if (regError) throw regError;

      await supabase.auth.signOut();
      router.replace('/(auth)/pending' as any);
    } catch (err: any) {
      setFormError(friendlyDbError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const stepTitles = ['Personal Info', 'Employment', 'KYC Documents'];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => step > 1 ? setStep(step - 1) : router.back()} style={styles.back}>
            <Text style={[styles.backText, { color: theme.textSecondary }]}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.header}>
            <Text style={{ fontSize: 36 }}>💼</Text>
            <Text style={[styles.title, { color: theme.text }]}>Employee Registration</Text>
          </View>

          {/* Steps */}
          <View style={styles.steps}>
            {stepTitles.map((t, i) => (
              <View key={i} style={styles.stepItem}>
                <View style={[styles.stepCircle, { backgroundColor: i + 1 <= step ? Colors.primary : theme.border }]}>
                  <Text style={[styles.stepNum, { color: i + 1 <= step ? '#FFF' : theme.textMuted }]}>
                    {i + 1 < step ? '✓' : i + 1}
                  </Text>
                </View>
                <Text style={[styles.stepLabel, { color: i + 1 <= step ? Colors.primary : theme.textMuted }]}>{t}</Text>
                {i < stepTitles.length - 1 && (
                  <View style={[styles.stepLine, { backgroundColor: i + 1 < step ? Colors.primary : theme.border }]} />
                )}
              </View>
            ))}
          </View>

          {step === 1 && (
            <Card>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Personal Information</Text>
              <Controller control={control} name="full_name" render={({ field: { onChange, value } }) => (
                <Input label="Full Name" placeholder="As per Aadhaar" value={value} onChangeText={onChange} error={errors.full_name?.message} required autoCapitalize="words" />
              )} />
              <Controller control={control} name="phone" render={({ field: { onChange, value } }) => (
                <Input label="Phone Number" placeholder="10-digit mobile" value={value} onChangeText={onChange} error={errors.phone?.message} required keyboardType="phone-pad" maxLength={10} />
              )} />
              <Controller control={control} name="email" render={({ field: { onChange, value } }) => (
                <Input label="Personal Email" placeholder="your@email.com" value={value} onChangeText={onChange} error={errors.email?.message} required keyboardType="email-address" />
              )} />
              <Controller control={control} name="password" render={({ field: { onChange, value } }) => (
                <Input label="Create Password" placeholder="Minimum 8 characters" value={value} onChangeText={onChange} error={errors.password?.message} required isPassword />
              )} />
              <Button title="Next: Employment Details →" onPress={handleNext} />
            </Card>
          )}

          {step === 2 && (
            <Card>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Employment Details</Text>
              <Controller control={control} name="company_name" render={({ field: { onChange, value } }) => (
                <Input label="Company Name" placeholder="Current employer" value={value} onChangeText={onChange} error={errors.company_name?.message} required autoCapitalize="words" />
              )} />
              <Controller control={control} name="employee_id" render={({ field: { onChange, value } }) => (
                <Input label="Employee ID" placeholder="Your employee/staff ID" value={value} onChangeText={onChange} error={errors.employee_id?.message} required autoCapitalize="characters" />
              )} />
              <Controller control={control} name="work_email" render={({ field: { onChange, value } }) => (
                <Input label="Work Email" placeholder="name@company.com" value={value} onChangeText={onChange} error={errors.work_email?.message} required keyboardType="email-address" />
              )} />
              <Controller control={control} name="designation" render={({ field: { onChange, value } }) => (
                <Input label="Designation" placeholder="Job title / Role" value={value} onChangeText={onChange} error={errors.designation?.message} required autoCapitalize="words" />
              )} />
              <Controller control={control} name="permanent_address" render={({ field: { onChange, value } }) => (
                <Input label="Permanent Address" placeholder="Full residential address" value={value} onChangeText={onChange} error={errors.permanent_address?.message} required multiline numberOfLines={3} style={{ minHeight: 80 }} />
              )} />
              <Controller control={control} name="family_contact_name" render={({ field: { onChange, value } }) => (
                <Input label="Emergency Contact Name" placeholder="Family member name" value={value} onChangeText={onChange} error={errors.family_contact_name?.message} required autoCapitalize="words" />
              )} />
              <Controller control={control} name="family_contact_phone" render={({ field: { onChange, value } }) => (
                <Input label="Emergency Contact Phone" placeholder="10-digit number" value={value} onChangeText={onChange} error={errors.family_contact_phone?.message} required keyboardType="phone-pad" maxLength={10} />
              )} />
              <Controller control={control} name="family_relation" render={({ field: { onChange, value } }) => (
                <Input label="Relation" placeholder="Spouse / Parent / Sibling" value={value} onChangeText={onChange} error={errors.family_relation?.message} required autoCapitalize="words" />
              )} />
              <Button title="Next: KYC Documents →" onPress={handleNext} />
            </Card>
          )}

          {step === 3 && (
            <Card>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>KYC Documents</Text>
              <View style={[styles.securityNote, { backgroundColor: Colors.info + '15', borderColor: Colors.info + '30' }]}>
                <Text style={[styles.securityText, { color: theme.info }]}>
                  🔒 All KYC documents are stored in a private bucket. Aadhaar & PAN are only accessible to authorized staff. PAN is AES-256 encrypted.
                </Text>
              </View>

              {/* Passport Photo */}
              <Text style={[styles.docLabel, { color: theme.text }]}>Passport Photo <Text style={{ color: theme.error }}>*</Text></Text>
              <TouchableOpacity onPress={() => pickImage('photo')} style={[styles.docPicker, { borderColor: photo.uri ? Colors.success : theme.border, backgroundColor: theme.surfaceAlt }]}>
                {photo.uri ? <Image source={{ uri: photo.uri }} style={styles.photoPreview} /> : (
                  <View style={styles.pickerContent}>
                    <Text style={{ fontSize: 32 }}>📷</Text>
                    <Text style={[styles.pickerText, { color: theme.textSecondary }]}>Upload passport photo</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Aadhaar Front */}
              <Text style={[styles.docLabel, { color: theme.text }]}>Aadhaar Front <Text style={{ color: theme.error }}>*</Text></Text>
              <TouchableOpacity onPress={() => pickImage('aadhaarFront')} style={[styles.docPicker, { borderColor: aadhaarFront.uri ? Colors.success : theme.border, backgroundColor: theme.surfaceAlt }]}>
                {aadhaarFront.uri ? <Image source={{ uri: aadhaarFront.uri }} style={styles.docPreview} /> : (
                  <View style={styles.pickerContent}>
                    <Text style={{ fontSize: 32 }}>🪪</Text>
                    <Text style={[styles.pickerText, { color: theme.textSecondary }]}>Aadhaar front side</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Aadhaar Back */}
              <Text style={[styles.docLabel, { color: theme.text }]}>Aadhaar Back <Text style={{ color: theme.error }}>*</Text></Text>
              <TouchableOpacity onPress={() => pickImage('aadhaarBack')} style={[styles.docPicker, { borderColor: aadhaarBack.uri ? Colors.success : theme.border, backgroundColor: theme.surfaceAlt }]}>
                {aadhaarBack.uri ? <Image source={{ uri: aadhaarBack.uri }} style={styles.docPreview} /> : (
                  <View style={styles.pickerContent}>
                    <Text style={{ fontSize: 32 }}>🪪</Text>
                    <Text style={[styles.pickerText, { color: theme.textSecondary }]}>Aadhaar back side</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* PAN */}
              <Controller control={control} name="pan_number" render={({ field: { onChange, value } }) => (
                <Input
                  label="PAN Number (Encrypted Storage)"
                  placeholder="ABCDE1234F"
                  value={value}
                  onChangeText={(t) => onChange(t.toUpperCase())}
                  error={errors.pan_number?.message}
                  required
                  autoCapitalize="characters"
                  maxLength={10}
                  hint="Format: 5 letters + 4 digits + 1 letter. Stored encrypted."
                />
              )} />

              {formError ? (
                <View style={[styles.errorBox, { backgroundColor: Colors.error + '15', borderColor: Colors.error + '40' }]}>
                  <Text style={[styles.errorText, { color: theme.error }]}>⚠️ {formError}</Text>
                </View>
              ) : null}

              <Button title="Submit for Approval" onPress={() => handleSubmit(onSubmit)()} isLoading={isLoading} />
              <Text style={[styles.submitNote, { color: theme.textMuted }]}>
                Review takes up to 24 hours. You will be notified once approved.
              </Text>
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, padding: Spacing.xl },
  back: { marginBottom: Spacing.base },
  backText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.base },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xl },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'] },
  steps: { flexDirection: 'row', marginBottom: Spacing.xl, alignItems: 'center' },
  stepItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stepCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm },
  stepLabel: { fontFamily: Typography.fontFamily.medium, fontSize: 9, marginLeft: 4, flex: 1 },
  stepLine: { height: 2, flex: 1 },
  sectionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md, marginBottom: Spacing.md },
  securityNote: { padding: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1, marginBottom: Spacing.md },
  securityText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, lineHeight: 18 },
  docLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, marginBottom: Spacing.sm },
  docPicker: { borderWidth: 2, borderStyle: 'dashed', borderRadius: BorderRadius.xl, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.base, minHeight: 100 },
  pickerContent: { alignItems: 'center', gap: Spacing.xs },
  pickerText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm },
  photoPreview: { width: 80, height: 80, borderRadius: 40 },
  docPreview: { width: '100%', height: 120, borderRadius: BorderRadius.md, resizeMode: 'contain' },
  errorBox: { padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.sm },
  errorText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, lineHeight: 20 },
  submitNote: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, textAlign: 'center', marginTop: Spacing.sm },
});

