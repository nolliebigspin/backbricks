import { createFileRoute } from '@tanstack/react-router';

import { HomePage } from '../home-page.tsx';

export const Route = createFileRoute('/')({ component: HomePage });
