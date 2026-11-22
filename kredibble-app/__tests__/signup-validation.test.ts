import {
  ageOn,
  checkDateOfBirth,
  friendlyServerMessage,
  passwordProblem,
  validateSignup,
} from '../src/lib/signup-validation';

// The short sign-up checks what the server checks. ALL DATA IS FAKE.

const NOW = new Date('2026-11-18T12:00:00Z');
const valid = { firstName: 'Test', lastName: 'Person', day: '01', month: '05', year: '2000', email: 'test.person@example.com', password: 'Str0ngPassword!' };

describe('date of birth', () => {
  it('counts whole years, so the sixteenth birthday is the first day allowed', () => {
    expect(ageOn(2010, 11, 18, NOW)).toBe(16);
    expect(ageOn(2010, 11, 19, NOW)).toBe(15);
    expect(checkDateOfBirth('18', '11', '2010', NOW)).toEqual({ ok: true, value: '2010-11-18' });
    expect(checkDateOfBirth('19', '11', '2010', NOW)).toEqual({ ok: false, message: 'You must be at least 16 to create an account' });
  });

  it('pads a day and month typed without a leading zero', () => {
    expect(checkDateOfBirth('1', '5', '2000', NOW)).toEqual({ ok: true, value: '2000-05-01' });
  });

  it('refuses dates that do not exist, are in the future or are far too old', () => {
    for (const [d, m, y] of [['30', '02', '2000'], ['31', '04', '2000'], ['29', '02', '2001'], ['00', '01', '2000'], ['01', '13', '2000'], ['01', '01', '2030'], ['01', '01', '1850']]) {
      expect(checkDateOfBirth(d, m, y, NOW).ok).toBe(false);
    }
    expect(checkDateOfBirth('29', '02', '2000', NOW).ok).toBe(true);
  });

  it('asks for the date when a box is empty or not a number', () => {
    expect(checkDateOfBirth('', '', '', NOW)).toEqual({ ok: false, message: 'Enter your date of birth' });
    expect(checkDateOfBirth('1', '5', '20', NOW).ok).toBe(false);
    expect(checkDateOfBirth('ab', '5', '2000', NOW).ok).toBe(false);
  });
});

describe('password', () => {
  it('follows the server rules', () => {
    expect(passwordProblem('short1A')).toBe('Use at least 10 characters');
    expect(passwordProblem('alllowercase1')).toBe('Add an uppercase letter');
    expect(passwordProblem('ALLUPPERCASE1')).toBe('Add a lowercase letter');
    expect(passwordProblem('NoNumbersHere')).toBe('Add a number');
    expect(passwordProblem('Password1')).toBe('Use at least 10 characters');
    expect(passwordProblem('Str0ngPassword!')).toBeNull();
  });
});

describe('the whole form', () => {
  it('has no errors when everything is right', () => {
    expect(validateSignup(valid, NOW)).toEqual({});
  });

  it('names each thing that is wrong', () => {
    const errors = validateSignup({ ...valid, firstName: ' ', lastName: '', email: 'nope', password: 'x', day: '1', month: '1', year: '2015' }, NOW);
    expect(errors).toMatchObject({
      firstName: 'Enter your first name',
      lastName: 'Enter your last name',
      email: 'Enter a valid email address',
      password: 'Use at least 10 characters',
      dateOfBirth: 'You must be at least 16 to create an account',
    });
  });

  it('keeps the full name within the 50 characters the server allows', () => {
    expect(validateSignup({ ...valid, firstName: 'A'.repeat(30), lastName: 'B'.repeat(30) }, NOW).lastName).toBe('Your name must be 50 characters or fewer');
  });
});

describe('server messages', () => {
  it('reads as a sentence, without the validation wrapper', () => {
    expect(friendlyServerMessage('Validation failed: dateOfBirth: You must be at least 16 to create an account')).toBe('You must be at least 16 to create an account');
    expect(friendlyServerMessage('Validation failed: dateOfBirth: Enter your date of birth, password: Add a number')).toBe('Enter your date of birth. Add a number');
    expect(friendlyServerMessage('User already exists')).toBe('User already exists');
  });
});
