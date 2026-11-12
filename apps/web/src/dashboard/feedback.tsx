import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { accountError } from '../auth/navigation.ts';

/** Unwrap generated/library responses without displaying raw server messages. */
export function unwrap<T>(result: { data?: T | null; error?: unknown }): T {
  if (result.error || result.data === undefined || result.data === null)
    throw result.error ?? new Error('Request failed');
  return result.data;
}

/** Mutations are deliberately outside Query's response cache (keys may be revealed once). */
export function useAction(describe: (error: unknown) => string = accountError) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const running = useRef(false);
  function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setDone(false);
    void (async () => {
      try {
        await work();
        setDone(true);
      } catch (cause) {
        setError(describe(cause));
      } finally {
        running.current = false;
        setBusy(false);
      }
    })();
  }
  return { run, busy, error, done };
}

export function Feedback({ error, done }: { error?: string; done?: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      {error && <p role="alert">{t(error)}</p>}
      {done && <output>{t('common.saved')}</output>}
    </>
  );
}
