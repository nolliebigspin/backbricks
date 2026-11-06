import { createRootRoute, Outlet } from '@tanstack/react-router';

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center p-6">
      <Outlet />
    </main>
  );
}
