import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { Colors } from '../../constants/design';
import { authStore } from '../../constants/authStore';
import { signupMobile } from '../../lib/api';
import { openPrivacyPolicy, openTermsOfService } from '../../lib/legal';
import {
  GENDER_OPTIONS,
  MIN_SIGNUP_AGE,
  checkDateOfBirth,
  friendlyServerMessage,
  passwordProblem,
  validateSignup,
  type GenderValue,
  type SignupErrors,
} from '../../lib/signup-validation';
import { DateOfBirthField } from '../../components/ui/DateOfBirthField';

// The full "Global Opportunity Desk" logo (the same file as the admin sign-in page, 435x151), in its own 435:151 shape: 150 x 52.
const LogoSVG = () => (
  <Image
    source={require('../../../assets/images/god-logo.png')}
    style={{ width: 150, height: 52 }}
    resizeMode="contain"
    accessibilityLabel="Global Opportunity Desk"
  />
);

const FieldLabel = ({ text, hint }: { text: string; hint?: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 4 }}>
    <Text style={{ fontSize: 13, color: '#1A1A1A', fontWeight: '500' }} className="font-sans">{text}</Text>
    {hint ? <Text style={{ fontSize: 12, color: '#A1A1AA' }} className="font-sans">{hint}</Text> : null}
  </View>
);

const FieldError = ({ message }: { message?: string }) =>
  message ? <Text style={{ marginTop: 6, fontSize: 12, color: '#DC2626' }} className="font-sans">{message}</Text> : null;

const Hint = ({ children }: { children: string }) => (
  <Text style={{ marginTop: 6, fontSize: 12, color: '#8A8D9F', lineHeight: 17 }} className="font-sans">{children}</Text>
);

// Module level so it is not re-created (and remounted) on every render of the screen.
const RoleCard = ({ label, active, onSelect, testID }: { label: string; active: boolean; onSelect: () => void; testID: string }) => (
  <TouchableOpacity
    testID={testID}
    onPress={onSelect}
    accessibilityRole="radio"
    accessibilityState={{ selected: active }}
    style={{ flex: 1, borderWidth: 1.5, borderColor: active ? Colors.primary : '#EBEBEE', borderRadius: 12, padding: 14, backgroundColor: '#FFFFFF' }}
  >
    <View
      style={{
        width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: active ? Colors.primary : '#C4C4C4',
        justifyContent: 'center', alignItems: 'center', marginBottom: 10,
      }}
    >
      {active && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary }} />}
    </View>
    <Text style={{ fontSize: 13, fontWeight: '600', color: active ? Colors.primary : '#8A8D9F', lineHeight: 18 }} className="font-sans">{label}</Text>
  </TouchableOpacity>
);

const inputBox = (error?: string) => ({
  height: 52,
  borderWidth: 1,
  borderColor: error ? '#DC2626' : '#EBEBEE',
  borderRadius: 12,
  paddingHorizontal: 16,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  backgroundColor: '#FFFFFF',
});

/**
 * Sign-up in one short screen: name, date of birth, gender (optional), email and password. Everything else (education, skills, CV, company
 * details) is asked after the person is in, through "Complete your profile". The server checks the same rules again.
 */
export default function SignupScreen() {
  const router = useRouter();
  const [role, setRole] = useState<'seeker' | 'hirer'>('seeker');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState({ day: '', month: '', year: '' });
  const [gender, setGender] = useState<GenderValue | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fields = { firstName, lastName, ...dob, email, password };
  const errors: SignupErrors = validateSignup(fields);
  const hasErrors = Object.keys(errors).length > 0;
  // An error only shows once the person has tried to continue, so the form is not red while it is still being filled in.
  const shown: SignupErrors = showErrors ? errors : {};

  const handleCreateAccount = async () => {
    setServerError('');
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    const checked = checkDateOfBirth(dob.day, dob.month, dob.year);
    if (!checked.ok) return;

    setIsSubmitting(true);
    try {
      const session = await signupMobile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: checked.value,
        ...(gender ? { gender } : {}),
        email: email.trim(),
        password,
        role,
      });
      authStore.setSession(session.token, session.user);
      authStore.setRole(role);
      router.replace('/(auth)/loading');
    } catch (error) {
      setServerError(error instanceof Error ? friendlyServerMessage(error.message) : 'Unable to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F7F9' }} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ marginBottom: 16 }}>
            <LogoSVG />
          </View>

          <Text style={{ fontSize: 22, color: Colors.primary, fontWeight: 'bold', fontStyle: 'italic', marginBottom: 6 }} className="font-sans">
            Create your account
          </Text>
          <Text style={{ fontSize: 13, color: '#8A8D9F', lineHeight: 20, marginBottom: 24 }} className="font-sans">
            It only takes a minute. You can add the rest of your profile once you are in.{' '}
            <Text style={{ color: Colors.primary, fontWeight: 'bold' }} onPress={() => router.replace('/(auth)/login')}>
              Go back to login
            </Text>
          </Text>

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }} accessibilityRole="radiogroup">
            <RoleCard testID="role-seeker" label={`Looking for\nOpportunities`} active={role === 'seeker'} onSelect={() => setRole('seeker')} />
            <RoleCard testID="role-hirer" label="Hiring Talent" active={role === 'hirer'} onSelect={() => setRole('hirer')} />
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel text="First name" />
              <View style={inputBox(shown.firstName)}>
                <TextInput
                  testID="signup-first-name"
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  placeholderTextColor="#A1A1AA"
                  autoCapitalize="words"
                  autoComplete="given-name"
                  textContentType="givenName"
                  style={{ flex: 1, fontSize: 14, color: '#1A1A1A' }}
                  className="font-sans"
                />
              </View>
              <FieldError message={shown.firstName} />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel text="Last name" />
              <View style={inputBox(shown.lastName)}>
                <TextInput
                  testID="signup-last-name"
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name"
                  placeholderTextColor="#A1A1AA"
                  autoCapitalize="words"
                  autoComplete="family-name"
                  textContentType="familyName"
                  style={{ flex: 1, fontSize: 14, color: '#1A1A1A' }}
                  className="font-sans"
                />
              </View>
              <FieldError message={shown.lastName} />
            </View>
          </View>

          <FieldLabel text="Date of birth" />
          <DateOfBirthField {...dob} onChange={setDob} error={shown.dateOfBirth} />
          <Hint>{`You must be ${MIN_SIGNUP_AGE} or older. We use this to confirm your age. It is never shown to other people.`}</Hint>

          <View style={{ height: 20 }} />
          <FieldLabel text="Gender" hint="(optional)" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup">
            {GENDER_OPTIONS.map((option) => {
              const active = gender === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  testID={`gender-${option.value}`}
                  onPress={() => setGender(active ? null : option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={{
                    paddingHorizontal: 14, height: 40, borderRadius: 20, borderWidth: 1.5, justifyContent: 'center',
                    borderColor: active ? Colors.primary : '#EBEBEE', backgroundColor: active ? Colors.primaryTransparent : '#FFFFFF',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '500', color: active ? Colors.primary : '#4B5563' }} className="font-sans">{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Hint>Helps us understand who we are reaching. You can leave it blank.</Hint>

          <View style={{ height: 20 }} />
          <FieldLabel text="Email" />
          <View style={inputBox(shown.email)}>
            <TextInput
              testID="signup-email"
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email address"
              placeholderTextColor="#A1A1AA"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              style={{ flex: 1, fontSize: 14, color: '#1A1A1A' }}
              className="font-sans"
            />
          </View>
          <FieldError message={shown.email} />

          <View style={{ height: 20 }} />
          <FieldLabel text="Password" />
          <View style={inputBox(shown.password)}>
            <TextInput
              testID="signup-password"
              value={password}
              onChangeText={setPassword}
              placeholder="Create a password"
              placeholderTextColor="#A1A1AA"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              style={{ flex: 1, fontSize: 14, color: '#1A1A1A' }}
              className="font-sans"
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={{ padding: 4 }} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={18} color="#A1A1AA" /> : <Eye size={18} color="#A1A1AA" />}
            </TouchableOpacity>
          </View>
          {shown.password ? (
            <FieldError message={shown.password} />
          ) : (
            <Hint>
              {password && !passwordProblem(password)
                ? 'Strong enough.'
                : 'At least 10 characters, with a lowercase letter, an uppercase letter and a number.'}
            </Hint>
          )}

          {serverError ? (
            <View style={{ marginTop: 20, padding: 12, borderRadius: 12, backgroundColor: Colors.errorTint }} accessibilityRole="alert">
              <Text style={{ fontSize: 13, color: Colors.error }} className="font-sans">{serverError}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            testID="signup-submit"
            onPress={handleCreateAccount}
            disabled={isSubmitting}
            accessibilityRole="button"
            style={{
              marginTop: 24, height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
              backgroundColor: hasErrors ? Colors.primary10 : Colors.primary,
            }}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={{ fontSize: 15, fontWeight: 'bold', color: hasErrors ? Colors.primary : '#FFFFFF' }} className="font-sans">Create account</Text>
            )}
          </TouchableOpacity>

          <Text style={{ marginTop: 16, fontSize: 12, color: '#8A8D9F', lineHeight: 18, textAlign: 'center' }} className="font-sans">
            By creating an account you agree to our{' '}
            <Text style={{ color: Colors.primary, fontWeight: '600' }} onPress={() => void openTermsOfService()}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={{ color: Colors.primary, fontWeight: '600' }} onPress={() => void openPrivacyPolicy()}>Privacy Policy</Text>.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
