import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '@/modules/auth/user.repository';

describe('normalizeEmail', () => {
  it('faz trim e lowercase', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });
});
