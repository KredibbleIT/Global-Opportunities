import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, FileText, Upload } from 'lucide-react-native';
import { Colors } from '../../constants/design';
import { authStore } from '../../constants/authStore';
import {
  COMPANY_SIZES,
  COUNTRIES,
  GRADUATION_YEARS,
  INDUSTRIES,
  POSITION_ROLES,
  PROGRAMS,
  SKILLS,
  STATUSES,
  UNIVERSITIES,
  CAREER_INTERESTS,
  getFlag,
} from '../../constants/profileOptions';
import { updateMyProfile, uploadFile } from '../../lib/api';
import { pickDocument, type PickedFile } from '../../lib/file-picker';
import { checkDateOfBirth, MIN_SIGNUP_AGE } from '../../lib/signup-validation';
import { ChipList, DropdownField, FieldLabel, PrimaryButton, TextField } from '../../components/ui/FormFields';
import { OptionPicker, type Option } from '../../components/ui/OptionPicker';
import { DateOfBirthField } from '../../components/ui/DateOfBirthField';
import { useToast } from '../../components/ui/ToastProvider';

const toOptions = (list: string[]): Option[] => list.map((value) => ({ value }));
const COUNTRY_OPTIONS: Option[] = COUNTRIES.map((c) => ({ value: c.name, label: `${getFlag(c.code)}  ${c.name}`, detail: c.dialCode }));
const dialCodeOf = (country: string) => COUNTRIES.find((c) => c.name === country)?.dialCode ?? '';

/** The server keeps lists as JSON text; this reads that or a real array. */
const listOf = (value: unknown): string[] => {
  let list: unknown = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
};
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const real = (value: unknown) => (/^(not specified|opportunity seeker)$/i.test(text(value).trim()) ? '' : text(value));

type Profile = Record<string, unknown>;

// ─── Shell shared by every step ───────────────────────────────────────────────

function StepShell({ title, subtitle, children, onSave, saving, error, canSave = true, saveLabel = 'Save' }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  error: string;
  canSave?: boolean;
  saveLabel?: string;
}) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Back" activeOpacity={0.7}>
          <ChevronLeft size={20} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} className="font-sans">{title}</Text>
        <View style={{ width: 38 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {subtitle ? <Text style={styles.subtitle} className="font-sans">{subtitle}</Text> : null}
          {children}
          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={{ fontSize: 13, color: Colors.error }} className="font-sans">{error}</Text>
            </View>
          ) : null}
          <PrimaryButton testID="step-save" label={saveLabel} onPress={onSave} disabled={!canSave} busy={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Saves some details, refreshes the signed-in account everywhere, and goes back to the checklist. */
function useSaveStep() {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (changes: Record<string, unknown>, prepare?: () => Promise<Record<string, unknown>>) => {
    setError('');
    setSaving(true);
    try {
      const extra = prepare ? await prepare() : {};
      const updated = await updateMyProfile({ ...changes, ...extra });
      if (authStore.token) authStore.setSession(authStore.token, updated);
      showToast('Saved', 'success');
      router.back();
    } catch (e) {
      const message = e instanceof Error ? e.message.replace(/^Validation failed:\s*/i, '') : 'Could not save. Try again.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };
  return { save, saving, error, setError };
}

// ─── Seeker steps ─────────────────────────────────────────────────────────────

function BasicsStep({ hasDob }: { hasDob: boolean }) {
  const { save, saving, error, setError } = useSaveStep();
  const [dob, setDob] = useState({ day: '', month: '', year: '' });
  const [problem, setProblem] = useState('');

  if (hasDob) {
    return (
      <StepShell title="Name and date of birth" onSave={() => undefined} saving={false} error="" canSave={false} saveLabel="Saved">
        <Text style={styles.subtitle} className="font-sans">Your date of birth is saved. It cannot be changed here. If it is wrong, contact the Global Opportunity Desk.</Text>
      </StepShell>
    );
  }
  return (
    <StepShell
      title="Date of birth"
      subtitle={`We use this to confirm you are ${MIN_SIGNUP_AGE} or older. It is never shown to other people.`}
      saving={saving}
      error={error}
      onSave={() => {
        const checked = checkDateOfBirth(dob.day, dob.month, dob.year);
        if (!checked.ok) {
          setProblem(checked.message);
          return;
        }
        setProblem('');
        setError('');
        void save({ dateOfBirth: checked.value });
      }}
    >
      <FieldLabel text="Date of birth" />
      <DateOfBirthField {...dob} onChange={setDob} error={problem} />
      <View style={{ height: 24 }} />
    </StepShell>
  );
}

function ContactStep({ seeker }: { seeker: Profile }) {
  const { save, saving, error } = useSaveStep();
  const [country, setCountry] = useState(text(seeker.country));
  const [city, setCity] = useState(text(seeker.city));
  const [phone, setPhone] = useState(text(seeker.phone));
  const [picker, setPicker] = useState(false);
  const [tried, setTried] = useState(false);

  const countryError = !country ? 'Choose your country' : undefined;
  const phoneError = phone.replace(/\D/g, '').length < 5 ? 'Enter your phone number' : undefined;

  return (
    <StepShell
      title="Contact details"
      subtitle="So we can show opportunities that fit where you are, and reach you about them."
      saving={saving}
      error={error}
      onSave={() => {
        setTried(true);
        if (countryError || phoneError) return;
        void save({ country, city: city.trim(), phone: phone.trim() });
      }}
    >
      <DropdownField testID="field-country" label="Country" value={country} placeholder="Select your country" onPress={() => setPicker(true)} error={tried ? countryError : undefined} />
      <TextField label="City" hint="(optional)" value={city} onChangeText={setCity} placeholder="Enter your city" autoCapitalize="words" />
      <TextField label="Phone number" value={phone} onChangeText={setPhone} placeholder="Enter your phone number" keyboardType="phone-pad" error={tried ? phoneError : undefined} testID="field-phone" />
      <OptionPicker
        visible={picker}
        title="Select your country"
        searchPlaceholder="Search country"
        options={COUNTRY_OPTIONS}
        selected={country ? [country] : []}
        onToggle={(value) => {
          setCountry(value);
          // Start the number with the country's dialling code when nothing is typed yet.
          if (!phone.replace(/\D/g, '')) setPhone(`(${dialCodeOf(value)}) `);
        }}
        onClose={() => setPicker(false)}
      />
    </StepShell>
  );
}

function EducationStep({ seeker }: { seeker: Profile }) {
  const { save, saving, error } = useSaveStep();
  const firstEducation = (() => {
    try {
      const parsed = typeof seeker.education === 'string' ? JSON.parse(seeker.education) : seeker.education;
      return Array.isArray(parsed) && parsed[0] && typeof parsed[0] === 'object' ? (parsed[0] as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  })();
  const [university, setUniversity] = useState(text(seeker.university) || text(firstEducation.institution));
  const [program, setProgram] = useState(text(firstEducation.degree));
  const [year, setYear] = useState(text(firstEducation.duration));
  const [status, setStatus] = useState(text(seeker.currentStatus));
  const [picker, setPicker] = useState<null | 'university' | 'program' | 'year' | 'status'>(null);
  const [tried, setTried] = useState(false);

  return (
    <StepShell
      title="Education"
      subtitle="Helps match you with scholarships, internships and jobs."
      saving={saving}
      error={error}
      onSave={() => {
        setTried(true);
        if (!university || !program) return;
        void save({
          university,
          currentStatus: status,
          education: [{ degree: program, institution: university, duration: year }],
        });
      }}
    >
      <DropdownField testID="field-university" label="University" value={university} placeholder="Select your university" onPress={() => setPicker('university')} error={tried && !university ? 'Choose your university' : undefined} />
      <DropdownField testID="field-program" label="Program" value={program} placeholder="Select your program" onPress={() => setPicker('program')} error={tried && !program ? 'Choose your program' : undefined} />
      <DropdownField label="Graduation year" hint="(optional)" value={year} placeholder="Select a year" onPress={() => setPicker('year')} />
      <DropdownField label="Current status" hint="(optional)" value={status} placeholder="Select your status" onPress={() => setPicker('status')} />

      <OptionPicker visible={picker === 'university'} title="Select your university" searchPlaceholder="Search university" options={toOptions(UNIVERSITIES)} selected={university ? [university] : []} onToggle={setUniversity} onClose={() => setPicker(null)} reference={{ key: 'universities', noun: 'university' }} />
      <OptionPicker visible={picker === 'program'} title="Select your program" searchPlaceholder="Search program" options={toOptions(PROGRAMS)} selected={program ? [program] : []} onToggle={setProgram} onClose={() => setPicker(null)} reference={{ key: 'programs', noun: 'program' }} />
      <OptionPicker visible={picker === 'year'} title="Graduation year" options={toOptions(GRADUATION_YEARS)} selected={year ? [year] : []} onToggle={setYear} onClose={() => setPicker(null)} />
      <OptionPicker visible={picker === 'status'} title="Current status" options={toOptions(STATUSES)} selected={status ? [status] : []} onToggle={setStatus} onClose={() => setPicker(null)} />
    </StepShell>
  );
}

function CareerStep({ seeker }: { seeker: Profile }) {
  const { save, saving, error } = useSaveStep();
  const [interest, setInterest] = useState(real(seeker.profession));
  const [skills, setSkills] = useState<string[]>(listOf(seeker.technicalSkills));
  const [countries, setCountries] = useState<string[]>(listOf(seeker.preferredCountries));
  const [picker, setPicker] = useState<null | 'interest' | 'skills' | 'countries'>(null);
  const [tried, setTried] = useState(false);

  const toggle = (list: string[], set: (next: string[]) => void) => (value: string) => set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  return (
    <StepShell
      title="Career interests"
      subtitle="The more we know, the better your matches."
      saving={saving}
      error={error}
      onSave={() => {
        setTried(true);
        if (!interest || skills.length === 0) return;
        void save({ profession: interest, technicalSkills: skills, preferredCountries: countries });
      }}
    >
      <DropdownField testID="field-interest" label="Career interest" value={interest} placeholder="Select your career interest" onPress={() => setPicker('interest')} error={tried && !interest ? 'Choose a career interest' : undefined} />
      <DropdownField testID="field-skills" label="Skills" value={skills.length ? `${skills.length} selected` : ''} placeholder="Select your skills" onPress={() => setPicker('skills')} error={tried && skills.length === 0 ? 'Choose at least one skill' : undefined} />
      <ChipList values={skills} onRemove={(value) => setSkills(skills.filter((item) => item !== value))} />
      <DropdownField label="Countries you would like to work or study in" hint="(optional)" value={countries.length ? `${countries.length} selected` : ''} placeholder="Select countries" onPress={() => setPicker('countries')} />
      <ChipList values={countries} onRemove={(value) => setCountries(countries.filter((item) => item !== value))} />

      <OptionPicker visible={picker === 'interest'} title="Career interest" searchPlaceholder="Search career interests" options={toOptions(CAREER_INTERESTS)} selected={interest ? [interest] : []} onToggle={setInterest} onClose={() => setPicker(null)} reference={{ key: 'career-interests', noun: 'career interest' }} />
      <OptionPicker visible={picker === 'skills'} multi title="Select your skills" subtitle="Choose as many as you like." searchPlaceholder="Search skills" options={toOptions(SKILLS)} selected={skills} onToggle={toggle(skills, setSkills)} onClose={() => setPicker(null)} reference={{ key: 'skills', noun: 'skill' }} />
      <OptionPicker visible={picker === 'countries'} multi title="Preferred countries" searchPlaceholder="Search country" options={COUNTRY_OPTIONS} selected={countries} onToggle={toggle(countries, setCountries)} onClose={() => setPicker(null)} />
    </StepShell>
  );
}

function CvStep({ seeker }: { seeker: Profile }) {
  const { save, saving, error, setError } = useSaveStep();
  const [file, setFile] = useState<PickedFile | null>(null);
  const current = text(seeker.resumeUrl);

  const choose = async () => {
    try {
      setError('');
      const picked = await pickDocument();
      if (picked) setFile(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not choose that file');
    }
  };

  return (
    <StepShell
      title="Your CV"
      subtitle="Employers ask for it when you apply. A PDF or Word document, up to 5MB."
      saving={saving}
      error={error}
      canSave={Boolean(file)}
      saveLabel={current ? 'Replace CV' : 'Save CV'}
      onSave={() => {
        if (!file) return;
        void save({}, async () => ({ resumeUrl: (await uploadFile(file, 'cvs')).url }));
      }}
    >
      {current && !file ? (
        <View style={styles.fileRow}>
          <FileText size={20} color={Colors.primary} />
          <Text style={{ flex: 1, fontSize: 14, color: '#1A1A1A' }} numberOfLines={1} className="font-sans">{decodeURIComponent(current.split('/').pop() ?? 'Your CV')}</Text>
          <Text style={{ fontSize: 12, color: '#16A34A' }} className="font-sans">Saved</Text>
        </View>
      ) : null}
      <TouchableOpacity testID="cv-choose" onPress={choose} accessibilityRole="button" style={styles.upload}>
        <Upload size={22} color={Colors.primary} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primary, marginTop: 8 }} className="font-sans">{file ? file.name : current ? 'Choose a different file' : 'Choose a file'}</Text>
      </TouchableOpacity>
      <View style={{ height: 24 }} />
    </StepShell>
  );
}

// ─── Hirer steps ──────────────────────────────────────────────────────────────

function CompanyStep({ hirer, personName }: { hirer: Profile; personName: string }) {
  const { save, saving, error } = useSaveStep();
  const startName = text(hirer.companyName) === personName ? '' : text(hirer.companyName);
  const [companyName, setCompanyName] = useState(startName);
  const [industry, setIndustry] = useState(real(hirer.industry));
  const [size, setSize] = useState(text(hirer.companySize));
  const [location, setLocation] = useState(real(hirer.location));
  const [website, setWebsite] = useState(text(hirer.website));
  const [companyEmail, setCompanyEmail] = useState(text(hirer.companyEmail));
  const [picker, setPicker] = useState<null | 'industry' | 'size' | 'location'>(null);
  const [tried, setTried] = useState(false);

  const emailError = companyEmail.trim() && !/^\S+@\S+\.\S+$/.test(companyEmail.trim()) ? 'Enter a valid email address' : undefined;
  const missing = !companyName.trim() || !industry || !size || !location;

  return (
    <StepShell
      title="Company details"
      subtitle="Candidates want to know who they are applying to."
      saving={saving}
      error={error}
      onSave={() => {
        setTried(true);
        if (missing || emailError) return;
        void save({
          companyName: companyName.trim(),
          industry,
          companySize: size,
          location,
          website: website.trim(),
          ...(companyEmail.trim() ? { companyEmail: companyEmail.trim() } : {}),
        });
      }}
    >
      <TextField testID="field-company-name" label="Company name" value={companyName} onChangeText={setCompanyName} placeholder="Enter your company name" autoCapitalize="words" error={tried && !companyName.trim() ? 'Enter your company name' : undefined} />
      <DropdownField label="Industry" value={industry} placeholder="Select an industry" onPress={() => setPicker('industry')} error={tried && !industry ? 'Choose an industry' : undefined} />
      <DropdownField label="Company size" value={size} placeholder="Select a size" onPress={() => setPicker('size')} error={tried && !size ? 'Choose a size' : undefined} />
      <DropdownField label="Country" value={location} placeholder="Select the company's country" onPress={() => setPicker('location')} error={tried && !location ? 'Choose a country' : undefined} />
      <TextField label="Website" hint="(optional)" value={website} onChangeText={setWebsite} placeholder="https://" keyboardType="url" autoCapitalize="none" />
      <TextField label="Company email" hint="(optional)" value={companyEmail} onChangeText={setCompanyEmail} placeholder="Enter the company email" keyboardType="email-address" autoCapitalize="none" error={emailError} />

      <OptionPicker visible={picker === 'industry'} title="Industry" options={toOptions(INDUSTRIES)} selected={industry ? [industry] : []} onToggle={setIndustry} onClose={() => setPicker(null)} />
      <OptionPicker visible={picker === 'size'} title="Company size" options={toOptions(COMPANY_SIZES)} selected={size ? [size] : []} onToggle={setSize} onClose={() => setPicker(null)} />
      <OptionPicker visible={picker === 'location'} title="Country" searchPlaceholder="Search country" options={COUNTRY_OPTIONS} selected={location ? [location] : []} onToggle={setLocation} onClose={() => setPicker(null)} />
    </StepShell>
  );
}

function RecruiterStep({ hirer }: { hirer: Profile }) {
  const { save, saving, error } = useSaveStep();
  const [role, setRole] = useState(text(hirer.recruiterRole));
  const [phone, setPhone] = useState(text(hirer.recruiterPhone));
  const [linkedin, setLinkedin] = useState(text(hirer.recruiterLinkedin));
  const [picker, setPicker] = useState(false);
  const [tried, setTried] = useState(false);

  const phoneError = phone.replace(/\D/g, '').length < 5 ? 'Enter your phone number' : undefined;

  return (
    <StepShell
      title="Your role"
      subtitle="Who candidates will hear from."
      saving={saving}
      error={error}
      onSave={() => {
        setTried(true);
        if (!role || phoneError) return;
        void save({ recruiterRole: role, recruiterPhone: phone.trim(), recruiterLinkedin: linkedin.trim() });
      }}
    >
      <DropdownField label="Your position" value={role} placeholder="Select your position" onPress={() => setPicker(true)} error={tried && !role ? 'Choose your position' : undefined} />
      <TextField label="Phone number" value={phone} onChangeText={setPhone} placeholder="Enter your phone number" keyboardType="phone-pad" error={tried ? phoneError : undefined} />
      <TextField label="LinkedIn" hint="(optional)" value={linkedin} onChangeText={setLinkedin} placeholder="Link to your LinkedIn profile" keyboardType="url" autoCapitalize="none" />
      <OptionPicker visible={picker} title="Your position" options={toOptions(POSITION_ROLES)} selected={role ? [role] : []} onToggle={setRole} onClose={() => setPicker(false)} />
    </StepShell>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

/** One step of "Complete your profile": which form to show depends on the step and on whether the person is a seeker or a hirer. */
export default function CompleteStepScreen() {
  const { step } = useLocalSearchParams<{ step?: string }>();
  const router = useRouter();
  const user = authStore.user;

  const missingStep = (
    <SafeAreaView style={styles.container}>
      <View style={{ padding: 24 }}>
        <Text style={styles.subtitle} className="font-sans">This step is not available.</Text>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.primary, fontWeight: '600' }} className="font-sans">Go back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
  if (!user || !step) return missingStep;

  if (step === 'basics') return <BasicsStep hasDob={Boolean(user.dateOfBirth)} />;
  if (user.role === 'seeker') {
    const seeker = (user.seeker ?? {}) as Profile;
    if (step === 'contact') return <ContactStep seeker={seeker} />;
    if (step === 'education') return <EducationStep seeker={seeker} />;
    if (step === 'career') return <CareerStep seeker={seeker} />;
    if (step === 'cv') return <CvStep seeker={seeker} />;
  }
  if (user.role === 'hirer') {
    const hirer = (user.hirer ?? {}) as Profile;
    if (step === 'company') return <CompanyStep hirer={hirer} personName={user.name} />;
    if (step === 'recruiter') return <RecruiterStep hirer={hirer} />;
  }
  return missingStep;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F9' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  backButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#E5E6F2', backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#1A1A1A' },
  subtitle: { fontSize: 13, color: '#6B7280', lineHeight: 20, marginBottom: 20 },
  errorBox: { marginBottom: 16, padding: 12, borderRadius: 12, backgroundColor: Colors.errorTint },
  upload: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.primary, borderRadius: 14, paddingVertical: 28, alignItems: 'center', backgroundColor: '#FFFFFF' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 14 },
});
