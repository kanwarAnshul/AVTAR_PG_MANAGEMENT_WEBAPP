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
import { friendlyDbError } from '../../../src/utils/helpers';
import { Colors, Typography, Spacing, BorderRadius, MAX_IMAGE_SIZE_BYTES, IMAGE_COMPRESS_SIZE, IMAGE_COMPRESS_QUALITY, ADDRESS_PROOF_TYPES } from '../../../src/constants/theme';
import { useThemeStore } from '../../../src/stores/themeStore';
import { Button } from '../../../src/components/ui/Button';
import { Input } from '../../../src/components/ui/Input';
import { Card } from '../../../src/components/ui/Card';

const schema = z.object({
  full_name: z.string().min(2, 'Enter full name'),
  email: z.string().email('Enter valid email'),
  password: z.string().min(8, 'Minimum 8 characters'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter valid 10-digit phone'),
  college_name: z.string().min(2, 'Enter college/school name'),
  roll_number: z.string().min(1, 'Enter roll number'),
  course: z.string().min(2, 'Enter course name'),
  permanent_address: z.string().min(10, 'Enter full address'),
  family_contact_name: z.string().min(2, 'Enter family contact name'),
  family_contact_phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter valid phone'),
  family_relation: z.string().min(2, 'Enter relation (Father/Mother/Guardian)'),
});

type FormData = z.infer<typeof schema>;

interface DocState {
  uri?: string;
  name?: string;
  type?: string;
  uploaded?: boolean;
}

export default function StudentRegisterScreen() {
  const { isDark } = useThemeStore();
  const theme = isDark ? Colors.dark : Colors.light;
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1); // 1=personal, 2=academic, 3=docs
  const [photo, setPhoto] = useState<DocState>({});
  const [addressProof, setAddressProof] = useState<DocState>({});
  const [addressProofType, setAddressProofType] = useState('');
  const [formError, setFormError] = useState('');

  const { control, handleSubmit, formState: { errors }, getValues, trigger } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const pickImage = async (docType: 'photo' | 'addressProof') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: docType === 'photo' ? [1, 1] : [4, 3],
      quality: IMAGE_COMPRESS_QUALITY,
      base64: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE_BYTES) {
        Alert.alert('File Too Large', 'Image must be under 2MB. Please choose a smaller image.');
        return;
      }
      const doc: DocState = {
        uri: asset.uri,
        name: asset.fileName ?? `${docType}_${Date.now()}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      };
      if (docType === 'photo') setPhoto(doc);
      else setAddressProof(doc);
    }
  };

  const handleNext = async () => {
    let fieldsToValidate: (keyof FormData)[] = [];
    if (step === 1) fieldsToValidate = ['full_name', 'email', 'password', 'phone'];
    else if (step === 2) fieldsToValidate = ['college_name', 'roll_number', 'course', 'permanent_address'];
    
    const valid = await trigger(fieldsToValidate);
    if (valid) setStep(step + 1);
  };

  const onSubmit = async (data: FormData) => {
    if (!photo.uri) { Alert.alert('Required', 'Please upload your photo'); return; }
    if (!addressProof.uri) { Alert.alert('Required', 'Please upload address proof'); return; }
    if (!addressProofType) { Alert.alert('Required', 'Please select address proof type'); return; }

    setIsLoading(true);
    setFormError('');
    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email.toLowerCase().trim(),
        password: data.password,
        options: {
          data: { role: 'tenant', full_name: data.full_name, phone: data.phone },
        },
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

      const userId = authData.user.id;

      // 2. Upload photo
      const photoPath = `${userId}/photo.jpg`;
      await uploadFile('tenant_docs', photoPath, photo as any);

      // 3. Upload address proof
      const proofPath = `${userId}/address_proof.jpg`;
      await uploadFile('tenant_docs', proofPath, addressProof as any);

      // 4. Create registration record
      const { error: regError } = await supabase.from('tenant_registrations').insert({
        user_id: userId,
        category: 'student',
        full_name: data.full_name,
        phone: data.phone,
        college_name: data.college_name,
        roll_number: data.roll_number,
        course: data.course,
        permanent_address: data.permanent_address,
        family_contact_name: data.family_contact_name,
        family_contact_phone: data.family_contact_phone,
        family_relation: data.family_relation,
        photo_url: photoPath,
        address_proof_type: addressProofType,
        address_proof_url: proofPath,
        status: 'pending',
      });
      if (regError) throw regError;

      // Sign out — cannot login until approved
      await supabase.auth.signOut();
      router.replace('/(auth)/pending' as any);
    } catch (err: any) {
      setFormError(friendlyDbError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const stepTitles = ['Personal Info', 'Academic Details', 'Documents'];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <TouchableOpacity onPress={() => step > 1 ? setStep(step - 1) : router.back()} style={styles.back}>
            <Text style={[styles.backText, { color: theme.textSecondary }]}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={{ fontSize: 36 }}>🎓</Text>
            <Text style={[styles.title, { color: theme.text }]}>Student Registration</Text>
          </View>

          {/* Step Indicator */}
          <View style={styles.steps}>
            {stepTitles.map((t, i) => (
              <View key={i} style={styles.stepItem}>
                <View style={[
                  styles.stepCircle,
                  { backgroundColor: i + 1 <= step ? Colors.primary : theme.border }
                ]}>
                  <Text style={[styles.stepNum, { color: i + 1 <= step ? '#FFF' : theme.textMuted }]}>
                    {i + 1 < step ? '✓' : i + 1}
                  </Text>
                </View>
                <Text style={[styles.stepLabel, { color: i + 1 <= step ? Colors.primary : theme.textMuted }]}>
                  {t}
                </Text>
                {i < stepTitles.length - 1 && (
                  <View style={[styles.stepLine, { backgroundColor: i + 1 < step ? Colors.primary : theme.border }]} />
                )}
              </View>
            ))}
          </View>

          {/* Step 1: Personal */}
          {step === 1 && (
            <Card style={{ marginBottom: Spacing.base }}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Personal Information</Text>
              <Controller control={control} name="full_name" render={({ field: { onChange, value } }) => (
                <Input label="Full Name" placeholder="As per Aadhaar" value={value} onChangeText={onChange} error={errors.full_name?.message} required autoCapitalize="words" />
              )} />
              <Controller control={control} name="phone" render={({ field: { onChange, value } }) => (
                <Input label="Phone Number" placeholder="10-digit mobile" value={value} onChangeText={onChange} error={errors.phone?.message} required keyboardType="phone-pad" maxLength={10} />
              )} />
              <Controller control={control} name="email" render={({ field: { onChange, value } }) => (
                <Input label="Email Address" placeholder="your@email.com" value={value} onChangeText={onChange} error={errors.email?.message} required keyboardType="email-address" />
              )} />
              <Controller control={control} name="password" render={({ field: { onChange, value } }) => (
                <Input label="Create Password" placeholder="Minimum 8 characters" value={value} onChangeText={onChange} error={errors.password?.message} required isPassword />
              )} />
              <Button title="Next: Academic Details →" onPress={handleNext} />
            </Card>
          )}

          {/* Step 2: Academic */}
          {step === 2 && (
            <Card style={{ marginBottom: Spacing.base }}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Academic Details</Text>
              <Controller control={control} name="college_name" render={({ field: { onChange, value } }) => (
                <Input label="College / School Name" placeholder="Enter institution name" value={value} onChangeText={onChange} error={errors.college_name?.message} required autoCapitalize="words" />
              )} />
              <Controller control={control} name="roll_number" render={({ field: { onChange, value } }) => (
                <Input label="Roll Number / Enrollment ID" placeholder="Student ID" value={value} onChangeText={onChange} error={errors.roll_number?.message} required autoCapitalize="characters" />
              )} />
              <Controller control={control} name="course" render={({ field: { onChange, value } }) => (
                <Input label="Course Name" placeholder="e.g. B.Tech, BCA, B.Sc" value={value} onChangeText={onChange} error={errors.course?.message} required autoCapitalize="words" />
              )} />
              <Controller control={control} name="permanent_address" render={({ field: { onChange, value } }) => (
                <Input label="Permanent Address" placeholder="Full residential address" value={value} onChangeText={onChange} error={errors.permanent_address?.message} required multiline numberOfLines={3} style={{ minHeight: 80 }} />
              )} />
              <Controller control={control} name="family_contact_name" render={({ field: { onChange, value } }) => (
                <Input label="Family Contact Name" placeholder="Father / Mother / Guardian" value={value} onChangeText={onChange} error={errors.family_contact_name?.message} required autoCapitalize="words" />
              )} />
              <Controller control={control} name="family_contact_phone" render={({ field: { onChange, value } }) => (
                <Input label="Family Contact Phone" placeholder="10-digit number" value={value} onChangeText={onChange} error={errors.family_contact_phone?.message} required keyboardType="phone-pad" maxLength={10} />
              )} />
              <Controller control={control} name="family_relation" render={({ field: { onChange, value } }) => (
                <Input label="Relation with Tenant" placeholder="Father / Mother / Guardian / Sibling" value={value} onChangeText={onChange} error={errors.family_relation?.message} required autoCapitalize="words" />
              )} />
              <Button title="Next: Upload Documents →" onPress={handleNext} />
            </Card>
          )}

          {/* Step 3: Documents */}
          {step === 3 && (
            <Card style={{ marginBottom: Spacing.base }}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Upload Documents</Text>
              <Text style={[styles.docNote, { color: theme.textSecondary }]}>
                All documents are stored securely in a private bucket with 60-second signed URLs. Max 2MB per image.
              </Text>

              {/* Photo */}
              <Text style={[styles.docLabel, { color: theme.text }]}>Passport Photo <Text style={{ color: theme.error }}>*</Text></Text>
              <TouchableOpacity onPress={() => pickImage('photo')} style={[styles.docPicker, { borderColor: photo.uri ? Colors.success : theme.border, backgroundColor: theme.surfaceAlt }]}>
                {photo.uri ? (
                  <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.pickerContent}>
                    <Text style={{ fontSize: 32 }}>📷</Text>
                    <Text style={[styles.pickerText, { color: theme.textSecondary }]}>Tap to upload photo</Text>
                    <Text style={[styles.pickerHint, { color: theme.textMuted }]}>JPG/PNG, max 2MB</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Address Proof Type */}
              <Text style={[styles.docLabel, { color: theme.text }]}>Address Proof Type <Text style={{ color: theme.error }}>*</Text></Text>
              <View style={styles.proofTypes}>
                {ADDRESS_PROOF_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setAddressProofType(type)}
                    style={[
                      styles.proofTypeBtn,
                      {
                        backgroundColor: addressProofType === type ? Colors.primary : theme.surfaceAlt,
                        borderColor: addressProofType === type ? Colors.primary : theme.border,
                      },
                    ]}
                  >
                    <Text style={[styles.proofTypeTxt, { color: addressProofType === type ? '#FFF' : theme.text }]}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Address Proof Image */}
              <Text style={[styles.docLabel, { color: theme.text }]}>Address Proof Image <Text style={{ color: theme.error }}>*</Text></Text>
              <TouchableOpacity onPress={() => pickImage('addressProof')} style={[styles.docPicker, { borderColor: addressProof.uri ? Colors.success : theme.border, backgroundColor: theme.surfaceAlt }]}>
                {addressProof.uri ? (
                  <Image source={{ uri: addressProof.uri }} style={styles.docPreview} />
                ) : (
                  <View style={styles.pickerContent}>
                    <Text style={{ fontSize: 32 }}>📄</Text>
                    <Text style={[styles.pickerText, { color: theme.textSecondary }]}>Tap to upload document</Text>
                    <Text style={[styles.pickerHint, { color: theme.textMuted }]}>JPG/PNG, max 2MB</Text>
                  </View>
                )}
              </TouchableOpacity>

              {formError ? (
                <View style={[styles.errorBox, { backgroundColor: Colors.error + '15', borderColor: Colors.error + '40' }]}>
                  <Text style={[styles.errorText, { color: theme.error }]}>⚠️ {formError}</Text>
                </View>
              ) : null}

              <Button title="Submit for Approval" onPress={() => handleSubmit(onSubmit)()} isLoading={isLoading} />
              <Text style={[styles.submitNote, { color: theme.textMuted }]}>
                Your registration will be reviewed within 24 hours.
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
  stepLabel: { fontFamily: Typography.fontFamily.medium, fontSize: 10, marginLeft: 4, flex: 1 },
  stepLine: { height: 2, flex: 1 },
  sectionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md, marginBottom: Spacing.md },
  docNote: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, marginBottom: Spacing.base, lineHeight: 18 },
  docLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, marginBottom: Spacing.sm },
  docPicker: { borderWidth: 2, borderStyle: 'dashed', borderRadius: BorderRadius.xl, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.base, minHeight: 100 },
  pickerContent: { alignItems: 'center', gap: Spacing.xs },
  pickerText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm },
  pickerHint: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs },
  photoPreview: { width: 80, height: 80, borderRadius: 40 },
  docPreview: { width: '100%', height: 120, borderRadius: BorderRadius.md, resizeMode: 'contain' },
  proofTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.base },
  proofTypeBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1 },
  proofTypeTxt: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs },
  errorBox: { padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.sm },
  errorText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, lineHeight: 20 },
  submitNote: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, textAlign: 'center', marginTop: Spacing.sm },
});

