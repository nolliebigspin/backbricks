import { Button } from '@backbricks/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { admin, auth } from '../auth/client.ts';
import { ChoiceField, Field, formText } from '../auth/fields.tsx';
import { TenantContext, canManage } from './context.tsx';
import { Feedback, unwrap, useAction } from './feedback.tsx';

/** One session-owned organization selector, with tenant caches cancelled before switching. */
export function DashboardShell() {
  const { t } = useTranslation();
  const session = auth.useSession();
  const client = useQueryClient();
  const action = useAction();
  const organizationId = session.data?.session.activeOrganizationId ?? '';
  const organizations = useQuery({
    queryKey: ['organizations', session.data?.user.id],
    enabled: Boolean(session.data),
    queryFn: async ({ signal }) =>
      unwrap(await auth.organization.list({ fetchOptions: { signal } })),
  });
  const membership = useQuery({
    queryKey: ['tenant', organizationId, 'membership'],
    enabled: Boolean(session.data && organizationId),
    queryFn: async ({ signal }) =>
      unwrap(await auth.organization.getActiveMember({ fetchOptions: { signal } })),
  });
  useEffect(() => {
    if (!session.isPending && !session.data) {
      client.clear();
      window.location.replace(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [session.isPending, session.data, client]);
  function select(selectedId: string) {
    action.run(async () => {
      await client.cancelQueries({ queryKey: ['tenant'] });
      client.removeQueries({ queryKey: ['tenant'] });
      unwrap(await auth.organization.setActive({ organizationId: selectedId }));
      window.location.assign('/');
    });
  }
  if (session.isPending || !session.data) return <output>{t('common.loading')}</output>;
  return (
    <div className="w-full space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <ChoiceField
            label={t('dashboard.organization')}
            value={organizationId}
            disabled={action.busy}
            onChange={(e) => select(e.target.value)}
          >
            <option value="">{t('dashboard.selectOrganization')}</option>
            {organizations.data?.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </ChoiceField>
          <a href="/organizations/new" className="text-sm underline">
            {t('dashboard.newOrganization')}
          </a>
        </div>
        <Button
          variant="outline"
          disabled={action.busy}
          onClick={() =>
            action.run(async () => {
              await auth.signOut();
              client.clear();
              window.location.replace('/login');
            })
          }
        >
          {t('common.signOut')}
        </Button>
      </div>
      <Feedback error={action.error || (organizations.isError ? 'auth.errors.generic' : '')} />
      {action.busy ? (
        <output>{t('common.working')}</output>
      ) : window.location.pathname === '/organizations/new' ? (
        <CreateOrganization />
      ) : !organizationId ? (
        <p>{t('dashboard.chooseOrganization')}</p>
      ) : membership.isPending ? (
        <output>{t('common.loading')}</output>
      ) : membership.isError || !membership.data ? (
        <div>
          <p role="alert">{t('dashboard.accessLost')}</p>
          <a className="underline" href="/organizations/new">
            {t('dashboard.newOrganization')}
          </a>
        </div>
      ) : (
        <TenantContext value={{ organizationId, role: membership.data.role }}>
          <nav
            className="flex flex-wrap gap-5 text-sm font-medium"
            aria-label={t('dashboard.navigation')}
          >
            <a href="/">{t('dashboard.projects')}</a>
            {canManage(membership.data.role) && (
              <>
                <a href="/members">{t('dashboard.members')}</a>
                <a href="/activity">{t('dashboard.activity')}</a>
              </>
            )}
          </nav>
          <div key={organizationId}>
            <Outlet />
          </div>
        </TenantContext>
      )}
    </div>
  );
}

function CreateOrganization() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const action = useAction();
  return (
    <section className="max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold">{t('dashboard.newOrganization')}</h1>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          action.run(async () => {
            const organization = unwrap(
              await auth.organization.create({
                name: formText(data, 'name'),
                slug: formText(data, 'slug'),
              }),
            );
            await client.cancelQueries();
            client.clear();
            unwrap(await auth.organization.setActive({ organizationId: organization.id }));
            window.location.assign('/');
          });
        }}
      >
        <Field label={t('common.name')} name="name" required maxLength={120} />
        <Field
          label={t('common.address')}
          name="slug"
          required
          maxLength={63}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
        />
        <p className="text-sm text-muted-foreground">{t('common.addressHint')}</p>
        <Feedback error={action.error} />
        <Button disabled={action.busy} type="submit">
          {t('common.create')}
        </Button>
      </form>
    </section>
  );
}

/** Only implemented modules may contribute live dashboard navigation. */
export function useOperationalModules() {
  return useQuery({
    queryKey: ['module-availability'],
    queryFn: async ({ signal }) =>
      unwrap(await admin.GET('/v1/meta', { signal })).modules.filter(
        (module) => module.operational,
      ),
  });
}
