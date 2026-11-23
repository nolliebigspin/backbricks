'use server';

import { createClient } from '@backbricks/sdk';
import { redirect } from 'next/navigation';

import { serverOptions } from './server.config.ts';

export async function sendFromServer(values: FormData) {
  const { baseUrl, secretKey } = serverOptions();
  if (!baseUrl || !secretKey) redirect('/?server=config');
  const email = values.get('email');
  const message = values.get('message');
  if (typeof email !== 'string' || typeof message !== 'string') redirect('/?server=invalid');
  try {
    await createClient({ baseUrl, secretKey }).forms.submit('contact-server', { email, message });
  } catch {
    redirect('/?server=failed');
  }
  redirect('/?server=sent');
}
