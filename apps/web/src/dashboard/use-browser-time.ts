import { useEffect, useState } from 'react';

/** Browser time is display-only; server clocks decide credential/invitation validity. */
export function useBrowserTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
