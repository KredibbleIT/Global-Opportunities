import { generatePassword } from '../scripts/create-admin.js';

// GOD-T60: create-admin refused about 1 in 20 of its own generated passwords (no digit).
describe('GOD-T60: create-admin generates a password that meets its own rules', () => {
  it('every generated password has a lowercase letter, an uppercase letter and a digit', () => {
    for (let i = 0; i < 2000; i += 1) {
      const password = generatePassword();
      expect(password).toHaveLength(24);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
    }
  });
});
