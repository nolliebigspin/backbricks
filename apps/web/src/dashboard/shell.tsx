import { Button, Logo, PageHeader } from '@backbricks/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { MenuIcon, XIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { auth } from '../auth/client.ts';
import { ChoiceField, Field, formText } from '../auth/fields.tsx';
import { LanguageSelect } from '../i18n/language-select.tsx';
import { TenantContext, canManage } from './context.tsx';
import { Feedback, unwrap, useAction } from './feedback.tsx';
import { NavLink, NavSection } from './nav-link.tsx';
import { ProjectNavigation } from './project-shell.tsx';

/** One session-owned organization selector, with tenant caches cancelled before switching. */
export function DashboardShell() {
  const { t } = useTranslation();
  const session = auth.useSession();
  const client = useQueryClient();
  const action = useAction();
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const { projectId } = useParams({ strict: false });
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
  if (session.isPending || !session.data) {
    return <output className="block p-6">{t('common.loading')}</output>;
  }
  const member = membership.data;
  const tenant = organizationId && member ? { organizationId, role: member.role } : null;

  const sidebar = (
    <aside
      id={menuId}
      className={`${menuOpen ? 'flex' : 'hidden'} fixed inset-x-0 top-14 bottom-0 z-30 flex-col gap-6 overflow-y-auto border-r bg-sidebar px-4 py-5 text-sidebar-foreground lg:inset-y-0 lg:top-0 lg:left-0 lg:flex lg:w-64`}
    >
      <a href="/" className="hidden px-2 lg:block">
        <Logo />
      </a>
      <div className="space-y-2 px-2">
        <ChoiceField
          label={t('dashboard.organization')}
          value={organizationId}
          disabled={action.busy}
          onChange={(e) => select(e.target.value)}
          className="w-full"
        >
          <option value="">{t('dashboard.selectOrganization')}</option>
          {organizations.data?.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </ChoiceField>
        <a
          href="/organizations/new"
          className="block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t('dashboard.newOrganization')}
        </a>
      </div>
      {tenant && projectId ? <ProjectNavigation projectId={projectId} /> : null}
      {tenant ? (
        <div className={projectId ? 'border-t pt-4' : undefined}>
          <NavSection label={t('dashboard.navigation')}>
            <NavLink href="/" exact>
              {t('dashboard.projects')}
            </NavLink>
            {canManage(tenant.role) && (
              <>
                <NavLink href="/members">{t('dashboard.members')}</NavLink>
                <NavLink href="/activity">{t('dashboard.activity')}</NavLink>
              </>
            )}
          </NavSection>
        </div>
      ) : null}
      <div className="mt-auto space-y-3 border-t px-2 pt-5">
        <p className="truncate text-sm text-muted-foreground">
          {t('dashboard.account', { email: session.data.user.email })}
        </p>
        <div className="flex items-center justify-between gap-2">
          <LanguageSelect />
          <Button
            variant="ghost"
            size="sm"
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
      </div>
    </aside>
  );

  const content = action.busy ? (
    <output>{t('common.working')}</output>
  ) : window.location.pathname === '/organizations/new' ? (
    <CreateOrganization />
  ) : !organizationId ? (
    <p>{t('dashboard.chooseOrganization')}</p>
  ) : membership.isPending ? (
    <output>{t('common.loading')}</output>
  ) : membership.isError || !tenant ? (
    <div className="space-y-2">
      <p role="alert">{t('dashboard.accessLost')}</p>
      <a className="underline" href="/organizations/new">
        {t('dashboard.newOrganization')}
      </a>
    </div>
  ) : (
    <div key={organizationId}>
      <Outlet />
    </div>
  );

  const frame = (
    <div className="min-h-dvh bg-background">
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-sidebar px-4 lg:hidden">
        <a href="/">
          <Logo />
        </a>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <XIcon data-icon="inline-start" /> : <MenuIcon data-icon="inline-start" />}
          {t(menuOpen ? 'dashboard.closeMenu' : 'dashboard.menu')}
        </Button>
      </div>
      {sidebar}
      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
          <Feedback error={action.error || (organizations.isError ? 'auth.errors.generic' : '')} />
          {content}
        </div>
      </main>
    </div>
  );
  return tenant ? <TenantContext value={tenant}>{frame}</TenantContext> : frame;
}

function CreateOrganization() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const action = useAction();
  return (
    <section className="max-w-lg space-y-8">
      <PageHeader title={t('dashboard.newOrganization')} />
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
