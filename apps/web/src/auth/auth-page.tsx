import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@backbricks/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { admin, auth } from './client.ts';
import { Field, formText } from './fields.tsx';
import { accountError, safeRedirect } from './navigation.ts';

export type AuthScreen = 'login' | 'signup' | 'checkEmail' | 'forgot' | 'reset' | 'invitation';

/** Tokens remain in component memory only and are removed from the address bar on arrival. */
export function AuthPage({ screen }: { screen: AuthScreen }) {
  const { t } = useTranslation();
  const session = auth.useSession();
  const [incoming] = useState(() => new URLSearchParams(window.location.search));
  const invitationId = incoming.get('invitationId');
  const token = incoming.get('token');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const capabilities = useQuery({
    queryKey: ['auth-capabilities'],
    queryFn: async ({ signal }) => {
      const result = await admin.GET('/v1/auth/capabilities', { signal });
      if (!result.data) throw new Error('Capabilities unavailable');
      return result.data;
    },
  });
  useEffect(() => {
    if (screen === 'reset') window.history.replaceState(null, '', '/reset-password');
  }, [screen]);
  const canSignup =
    Boolean(invitationId) ||
    (capabilities.data?.signupPolicy === 'open' && capabilities.data.emailAvailable);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    const email = formText(values, 'email');
    const password = formText(values, 'password');
    setBusy(true);
    setError('');
    try {
      const result =
        screen === 'login'
          ? await auth.signIn.email({ email, password })
          : screen === 'signup' || (screen === 'invitation' && !session.data)
            ? await auth.signUp.email({
                name: formText(values, 'name'),
                email,
                password,
                callbackURL: '/login',
                ...(invitationId ? { fetchOptions: { body: { invitationId } } } : {}),
              })
            : screen === 'forgot'
              ? await auth.requestPasswordReset({ email, redirectTo: '/reset-password' })
              : screen === 'reset'
                ? await auth.resetPassword({ newPassword: password, token: token ?? '' })
                : screen === 'invitation'
                  ? await auth.organization.acceptInvitation({ invitationId: invitationId ?? '' })
                  : await auth.sendVerificationEmail({ email, callbackURL: '/login' });
      if (result.error) {
        setError(accountError(result.error));
        return;
      }
      if (screen === 'login' || (signingUp && Boolean(invitationId))) {
        window.location.assign(
          screen !== 'login' ? '/' : safeRedirect(incoming.get('redirect'), window.location.origin),
        );
      } else if (screen === 'invitation') window.location.assign('/');
      else setDone(true);
    } catch {
      setError('auth.errors.generic');
    } finally {
      setBusy(false);
    }
  }
  const signingUp = screen === 'signup' || (screen === 'invitation' && !session.data);
  const invalidToken = screen === 'reset' && (!token || incoming.has('error'));
  const unavailable =
    (screen === 'signup' && !canSignup) ||
    (screen === 'invitation' && !invitationId) ||
    invalidToken;
  const emailForm = ['login', 'signup', 'forgot', 'checkEmail'].includes(screen) || signingUp;
  const passwordForm = ['login', 'signup', 'reset'].includes(screen) || signingUp;
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>
          <h1>{t(`auth.${screen}.title`)}</h1>
        </CardTitle>
        <CardDescription>{t(`auth.${screen}.description`)}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {capabilities.isPending || (screen === 'invitation' && session.isPending) ? (
            <output>{t('common.loading')}</output>
          ) : capabilities.isError ? (
            <p role="alert">{t('auth.errors.generic')}</p>
          ) : done ? (
            <output>{t(`auth.${screen}.success`)}</output>
          ) : unavailable ? (
            <p role="alert">
              {t(
                invalidToken || screen === 'invitation'
                  ? 'auth.errors.expired'
                  : 'auth.errors.inviteOnly',
              )}
            </p>
          ) : (
            <form
              onSubmit={(event) => {
                void submit(event);
              }}
              className="space-y-4"
            >
              {signingUp && (
                <Field
                  name="name"
                  label={t('auth.name')}
                  autoComplete="name"
                  required
                  maxLength={120}
                />
              )}
              {emailForm && (
                <Field
                  name="email"
                  label={t('auth.email')}
                  type="email"
                  autoComplete="email"
                  required
                />
              )}
              {passwordForm && (
                <Field
                  name="password"
                  label={t('auth.password')}
                  type="password"
                  autoComplete={screen === 'login' ? 'current-password' : 'new-password'}
                  minLength={capabilities.data?.passwordMinLength}
                  maxLength={128}
                  required
                />
              )}
              {passwordForm && screen !== 'login' && (
                <p className="text-sm text-muted-foreground">
                  {t('auth.passwordHint', { count: capabilities.data?.passwordMinLength })}
                </p>
              )}
              {screen === 'invitation' && session.data && (
                <p>{t('auth.invitation.account', { email: session.data.user.email })}</p>
              )}
              {error && <p role="alert">{t(error)}</p>}
              <Button
                type="submit"
                disabled={
                  busy ||
                  (['forgot', 'checkEmail'].includes(screen) && !capabilities.data?.emailAvailable)
                }
                className="w-full"
              >
                {t(busy ? 'common.working' : `auth.${screen}.submit`)}
              </Button>
              {!capabilities.data?.emailAvailable && ['forgot', 'checkEmail'].includes(screen) && (
                <p>{t('auth.errors.noEmail')}</p>
              )}
            </form>
          )}
          <nav
            className="flex flex-wrap gap-x-4 gap-y-2 text-sm underline"
            aria-label={t('auth.navigation')}
          >
            {screen !== 'login' && (
              <a
                href={
                  invitationId
                    ? `/login?redirect=${encodeURIComponent(`/accept-invitation?invitationId=${invitationId}`)}`
                    : '/login'
                }
              >
                {t('auth.login.title')}
              </a>
            )}
            {screen === 'login' && (
              <>
                <a href="/forgot-password">{t('auth.forgot.title')}</a>
                <a href="/check-email">{t('auth.checkEmail.title')}</a>
              </>
            )}
            {screen !== 'signup' && canSignup && (
              <a
                href={
                  invitationId
                    ? `/signup?invitationId=${encodeURIComponent(invitationId)}`
                    : '/signup'
                }
              >
                {t('auth.signup.title')}
              </a>
            )}
          </nav>
        </div>
      </CardContent>
    </Card>
  );
}
