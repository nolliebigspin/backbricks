import { Button, ConfirmDialog, Label, StatusBadge } from '@backbricks/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { admin } from '../../auth/client.ts';
import { Feedback, unwrap, useAction } from '../../dashboard/feedback.tsx';
import {
  formsError,
  SUBMISSION_EVENT,
  useFormsScope,
  useNotificationOptions,
  useNotificationRules,
  type FormInstance,
} from './api.ts';

/**
 * Email notifications for this form. Recipients are verified members chosen from a list (Q14);
 * mail is content-free unless "include entry content" is switched on, with a warning.
 */
export function NotificationRules({ form }: { form: FormInstance }) {
  const { t } = useTranslation();
  const scope = useFormsScope();
  const client = useQueryClient();
  const rules = useNotificationRules(true);
  const options = useNotificationOptions(true);
  const action = useAction(formsError);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const names = new Map(
    options.data?.recipients.map((member) => [member.id, `${member.name} (${member.email})`]),
  );
  const own = rules.data?.filter((rule) => rule.instanceId === form.id) ?? [];
  const refresh = () =>
    client.invalidateQueries({ queryKey: [...scope.prefix, 'notification-rules'] });
  const path = { projectId: scope.projectId };
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{t('forms.notifications.title')}</h2>
      {options.data && !options.data.emailAvailable && (
        <p role="note">{t('forms.notifications.noEmail')}</p>
      )}
      {(rules.isError || options.isError) && (
        <Feedback error={formsError(rules.error ?? options.error)} />
      )}
      {own.length > 0 && (
        <ul className="divide-y rounded-lg border bg-background">
          {own.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <p className="break-words">
                  {rule.recipientUserIds.map((id) => names.get(id) ?? '–').join(', ') ||
                    t('forms.notifications.noRecipients')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={rule.enabled ? 'positive' : 'neutral'}>
                    {t(rule.enabled ? 'forms.notifications.on' : 'forms.notifications.off')}
                  </StatusBadge>
                  {rule.includeContent && (
                    <StatusBadge tone="warning">{t('forms.notifications.withContent')}</StatusBadge>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={action.busy || (!rule.enabled && rule.recipientUserIds.length === 0)}
                  onClick={() =>
                    action.run(async () => {
                      unwrap(
                        await admin.PATCH('/v1/projects/{projectId}/notification-rules/{ruleId}', {
                          params: { path: { ...path, ruleId: rule.id } },
                          headers: scope.headers,
                          body: { enabled: !rule.enabled },
                        }),
                      );
                      await refresh();
                    })
                  }
                >
                  {t(rule.enabled ? 'forms.notifications.pause' : 'forms.notifications.resume')}
                </Button>
                <Button
                  variant="outline"
                  disabled={action.busy}
                  onClick={() => setRemoveId(rule.id)}
                >
                  {t('forms.notifications.remove')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Feedback error={action.error} />
      {options.data && (
        <AddRule
          form={form}
          members={options.data.recipients}
          onAdded={refresh}
          disabled={action.busy}
        />
      )}
      {removeId && (
        <ConfirmDialog
          title={t('forms.notifications.removeTitle')}
          description={t('forms.notifications.removeDescription')}
          confirmLabel={t('forms.notifications.remove')}
          cancelLabel={t('common.cancel')}
          onClose={() => setRemoveId(null)}
          onConfirm={() => {
            const ruleId = removeId;
            setRemoveId(null);
            action.run(async () => {
              const result = await admin.DELETE(
                '/v1/projects/{projectId}/notification-rules/{ruleId}',
                { params: { path: { ...path, ruleId } }, headers: scope.headers },
              );
              if (result.error) throw result.error;
              await refresh();
            });
          }}
        />
      )}
    </section>
  );
}

function AddRule({
  form,
  members,
  onAdded,
  disabled,
}: {
  form: FormInstance;
  members: readonly { id: string; name: string; email: string }[];
  onAdded: () => Promise<void>;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const scope = useFormsScope();
  const action = useAction(formsError);
  const [chosen, setChosen] = useState<string[]>([]);
  const [includeContent, setIncludeContent] = useState(false);
  const contentId = useId();
  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        action.run(async () => {
          unwrap(
            await admin.POST('/v1/projects/{projectId}/notification-rules', {
              params: { path: { projectId: scope.projectId } },
              headers: scope.headers,
              body: {
                eventType: SUBMISSION_EVENT,
                instanceId: form.id,
                recipientUserIds: chosen,
                includeContent,
              },
            }),
          );
          setChosen([]);
          setIncludeContent(false);
          await onAdded();
        });
      }}
    >
      <fieldset className="space-y-2" disabled={disabled || action.busy}>
        <legend className="font-medium">{t('forms.notifications.add')}</legend>
        {members.length === 0 && <p>{t('forms.notifications.noMembers')}</p>}
        {members.map((member) => (
          <MemberChoice
            key={member.id}
            name={`${member.name} (${member.email})`}
            checked={chosen.includes(member.id)}
            onChange={(checked) =>
              setChosen((current) =>
                checked ? [...current, member.id] : current.filter((id) => id !== member.id),
              )
            }
          />
        ))}
        <div className="flex items-center gap-2 pt-2">
          <input
            id={contentId}
            type="checkbox"
            checked={includeContent}
            onChange={(event) => setIncludeContent(event.target.checked)}
          />
          <Label htmlFor={contentId}>{t('forms.notifications.includeContent')}</Label>
        </div>
        {includeContent && (
          <p role="note" className="text-sm text-destructive">
            {t('forms.notifications.contentWarning')}
          </p>
        )}
        <Button type="submit" disabled={chosen.length === 0}>
          {t('forms.notifications.save')}
        </Button>
      </fieldset>
      <Feedback error={action.error} done={action.done} />
    </form>
  );
}

function MemberChoice({
  name,
  checked,
  onChange,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <Label htmlFor={id}>{name}</Label>
    </div>
  );
}
