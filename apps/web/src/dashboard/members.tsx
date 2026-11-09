import { Button, ConfirmDialog, KeyRevealDialog } from '@backbricks/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { auth } from '../auth/client.ts';
import { ChoiceField, Field, formText } from '../auth/fields.tsx';
import { accountError } from '../auth/navigation.ts';
import { canManage, useTenant } from './context.tsx';
import { Feedback, unwrap, useAction } from './feedback.tsx';
import { useBrowserTime } from './use-browser-time.ts';

export function MembersPage() {
  const { t } = useTranslation();
  const { role } = useTenant();
  return canManage(role) ? <ManageMembers /> : <p role="alert">{t('dashboard.forbidden')}</p>;
}

function ManageMembers() {
  const now = useBrowserTime();
  const { t, i18n } = useTranslation();
  const { organizationId, role } = useTenant();
  const client = useQueryClient();
  const action = useAction();
  const [link, setLink] = useState<string | null>(null);
  const [pending, setPending] = useState<{ memberId: string; role?: 'member' | 'admin' } | null>(
    null,
  );
  const members = useQuery({
    queryKey: ['tenant', organizationId, 'members'],
    queryFn: async ({ signal }) =>
      unwrap(
        await auth.organization.listMembers({
          query: { organizationId },
          fetchOptions: { signal },
        }),
      ),
  });
  const invitations = useQuery({
    queryKey: ['tenant', organizationId, 'invitations'],
    queryFn: async ({ signal }) =>
      unwrap(
        await auth.organization.listInvitations({
          query: { organizationId },
          fetchOptions: { signal },
        }),
      ),
  });
  async function refresh() {
    await client.invalidateQueries({ queryKey: ['tenant', organizationId] });
  }
  async function invite(email: string, invitedRole: 'admin' | 'member', resend = false) {
    setLink(null);
    const invitation = unwrap(
      await auth.organization.inviteMember({
        organizationId,
        email,
        role: invitedRole,
        ...(resend ? { resend: true } : {}),
      }),
    );
    // The guarded server adds this only for authorized creators on installations without SMTP.
    if ('invitationUrl' in invitation && typeof invitation.invitationUrl === 'string') {
      const url = new URL(invitation.invitationUrl, window.location.origin);
      if (url.origin === window.location.origin && url.pathname === '/accept-invitation')
        setLink(url.href);
    }
    await refresh();
  }
  return (
    <section className="space-y-7">
      <h1 className="text-2xl font-semibold">{t('dashboard.members')}</h1>
      <Feedback error={action.error} done={action.done} />
      {members.isPending ? (
        <output>{t('common.loading')}</output>
      ) : members.isError ? (
        <Feedback error={accountError(members.error)} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t('members.total', { count: members.data.total })}
          </p>
          <ul className="divide-y rounded-lg border bg-background">
            {members.data.members.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <p className="break-words font-medium">{member.user.name}</p>
                  <p className="break-all text-sm text-muted-foreground">{member.user.email}</p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <ChoiceField
                    label={t('members.role')}
                    value={member.role}
                    disabled={action.busy || (member.role === 'owner' && role !== 'owner')}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === 'admin' || value === 'member')
                        setPending({ memberId: member.id, role: value });
                    }}
                  >
                    {member.role === 'owner' && <option value="owner">{t('roles.owner')}</option>}
                    <option value="admin">{t('roles.admin')}</option>
                    <option value="member">{t('roles.member')}</option>
                  </ChoiceField>
                  <Button
                    variant="outline"
                    disabled={action.busy || (member.role === 'owner' && role !== 'owner')}
                    onClick={() => setPending({ memberId: member.id })}
                  >
                    {t('members.remove')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t('members.invite')}</h2>
        <form
          className="max-w-xl space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            action.run(async () =>
              invite(
                formText(data, 'email'),
                formText(data, 'role') === 'admin' ? 'admin' : 'member',
              ),
            );
          }}
        >
          <Field label={t('auth.email')} name="email" type="email" required />
          <ChoiceField label={t('members.role')} name="role" defaultValue="member">
            <option value="member">{t('roles.member')}</option>
            <option value="admin">{t('roles.admin')}</option>
          </ChoiceField>
          <p className="text-sm text-muted-foreground">{t('members.roleHint')}</p>
          <Button type="submit" disabled={action.busy}>
            {t('members.invite')}
          </Button>
        </form>
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t('members.invitations')}</h2>
        {invitations.isError ? (
          <Feedback error={accountError(invitations.error)} />
        ) : invitations.isPending ? (
          <output>{t('common.loading')}</output>
        ) : (
          <ul className="divide-y rounded-lg border bg-background">
            {invitations.data.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-4 p-5"
              >
                <div className="min-w-0">
                  <p className="break-all font-medium">{invitation.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      invitation.status === 'pending' && new Date(invitation.expiresAt) <= now
                        ? 'members.expired'
                        : `members.status.${invitation.status}`,
                    )}{' '}
                    ·{' '}
                    {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
                      new Date(invitation.expiresAt),
                    )}
                  </p>
                </div>
                {invitation.status === 'pending' && (
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      disabled={action.busy}
                      onClick={() =>
                        action.run(async () =>
                          invite(
                            invitation.email,
                            invitation.role === 'admin' ? 'admin' : 'member',
                            true,
                          ),
                        )
                      }
                    >
                      {t('members.resend')}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={action.busy}
                      onClick={() =>
                        action.run(async () => {
                          unwrap(
                            await auth.organization.cancelInvitation({
                              invitationId: invitation.id,
                            }),
                          );
                          setLink(null);
                          await refresh();
                        })
                      }
                    >
                      {t('members.cancel')}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {pending && (
        <ConfirmDialog
          title={t(pending.role ? 'members.changeTitle' : 'members.removeTitle')}
          description={t(pending.role ? 'members.changeDescription' : 'members.removeDescription')}
          confirmLabel={t(pending.role ? 'common.save' : 'members.remove')}
          cancelLabel={t('common.cancel')}
          onClose={() => setPending(null)}
          onConfirm={() => {
            const change = pending;
            setPending(null);
            action.run(async () => {
              if (change.role)
                unwrap(
                  await auth.organization.updateMemberRole({
                    organizationId,
                    memberId: change.memberId,
                    role: change.role,
                  }),
                );
              else
                unwrap(
                  await auth.organization.removeMember({
                    organizationId,
                    memberIdOrEmail: change.memberId,
                  }),
                );
              await refresh();
            });
          }}
        />
      )}
      {link && (
        <KeyRevealDialog
          token={link}
          title={t('members.linkTitle')}
          description={t('members.linkDescription')}
          copyLabel={t('members.copyLink')}
          closeLabel={t('common.close')}
          copiedLabel={t('common.copied')}
          copyErrorLabel={t('members.copyError')}
          onClose={() => setLink(null)}
        />
      )}
    </section>
  );
}
