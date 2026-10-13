/** Mirrors the Supabase Auth password policy configured in supabase/config.toml. */
export const PASSWORD_MIN_LENGTH = 10;

export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`at least ${PASSWORD_MIN_LENGTH} characters`);
  if (!/[a-z]/.test(password)) problems.push('a lowercase letter');
  if (!/[A-Z]/.test(password)) problems.push('an uppercase letter');
  if (!/[0-9]/.test(password)) problems.push('a number');
  return problems;
}

export function authErrorMessage(error: { message?: string; code?: string; status?: number } | null | undefined): string {
  if (!error) return 'Something went wrong. Please try again.';
  const code = error.code ?? '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(error.message ?? '')) return 'The email address or password is incorrect.';
  if (code === 'user_banned') return 'This account has been deactivated. Contact a PRAYASH administrator.';
  if (code === 'email_not_confirmed') return 'This account has not been activated yet. Use the link in your invitation email.';
  if (code === 'otp_expired' || /expired|invalid/i.test(error.message ?? '')) return 'This link has expired or has already been used. Request a new one.';
  if (code === 'weak_password') return 'This password is too weak. Use a longer password with upper and lower case letters and numbers.';
  if (code === 'same_password') return 'Choose a password different from your current one.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || error.status === 429) return 'Too many attempts. Please wait a few minutes and try again.';
  if (code === 'mfa_verification_failed') return 'That code is not correct. Check your authenticator app and try again.';
  if (/fetch|network/i.test(error.message ?? '')) return 'We could not reach the server. Check your connection and try again.';
  return 'Something went wrong. Please try again.';
}
