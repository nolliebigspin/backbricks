import './styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { initialLanguage, initI18n } from './i18n/index.ts';
import { routeTree } from './routeTree.gen.ts';

const router = createRouter({ routeTree });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const i18n = await initI18n(initialLanguage(navigator.languages));
document.documentElement.lang = i18n.language;

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing in index.html');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
