import { sendFromServer } from './send-from-server.ts';
import { ContactAndReviews } from './widgets.tsx';

// oxlint-disable-next-line import/no-default-export -- Next.js App Router convention.
export default function Home() {
  return (
    <main>
      <h1>Backbricks integration example</h1>
      <ContactAndReviews />
      <section>
        <h2>Server-action variant</h2>
        <p>
          Configure the server-only key and a plain form with short name <code>contact-server</code>
          .
        </p>
        <form action={sendFromServer}>
          <label>
            Email <input name="email" type="email" required />
          </label>
          <label>
            Message <textarea name="message" required />
          </label>
          <button type="submit">Send from server</button>
        </form>
      </section>
    </main>
  );
}
