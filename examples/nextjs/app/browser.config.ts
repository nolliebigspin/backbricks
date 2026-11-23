export function browserOptions() {
  return {
    baseUrl: process.env.NEXT_PUBLIC_BACKBRICKS_URL,
    publishableKey: process.env.NEXT_PUBLIC_BACKBRICKS_KEY,
  };
}
