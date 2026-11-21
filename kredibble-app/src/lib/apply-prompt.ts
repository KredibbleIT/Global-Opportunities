import { Alert } from 'react-native';
import { authStore } from '../constants/authStore';

// Applying is the moment a CV matters, and posting is the moment the company name matters, so that is where each is asked for (instead of at
// sign-up).

/** True when the signed-in seeker has not saved a CV on their profile yet. */
export const lacksCv = (): boolean => authStore.user?.role === 'seeker' && Boolean(authStore.user.profileCompletion?.missing.includes('cv'));

export type CvChoice = 'add' | 'continue' | 'cancel';

/** Asks whether to add a CV now, apply without one, or stop. Closing the dialog counts as stopping. */
export const askForCv = (): Promise<CvChoice> =>
  new Promise((resolve) => {
    Alert.alert(
      'Add your CV?',
      'Employers look at your CV when you apply. You can add it now, or apply without it.',
      [
        { text: 'Add CV', onPress: () => resolve('add') },
        { text: 'Apply without it', onPress: () => resolve('continue') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
      ],
      { cancelable: true, onDismiss: () => resolve('cancel') },
    );
  });

/** True when the signed-in hirer has not filled in their company details yet (the listing would carry their own name as the company). */
export const lacksCompanyDetails = (): boolean => authStore.user?.role === 'hirer' && Boolean(authStore.user.profileCompletion?.missing.includes('company'));

/** Asks whether to add company details now, post anyway, or stop. Closing the dialog counts as stopping. */
export const askForCompanyDetails = (): Promise<CvChoice> =>
  new Promise((resolve) => {
    Alert.alert(
      'Add your company details?',
      'Candidates see the company name on your listing. You can add the details now, or post without them.',
      [
        { text: 'Add details', onPress: () => resolve('add') },
        { text: 'Post anyway', onPress: () => resolve('continue') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
      ],
      { cancelable: true, onDismiss: () => resolve('cancel') },
    );
  });
