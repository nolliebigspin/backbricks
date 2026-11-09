/** Flat HTML fields, including repeated multiselect names; prototype names remain ordinary data. */
export function formEnvelope(body: Uint8Array): {
  data: Record<string, string | string[]>;
  proof?: unknown;
} {
  const fields = new URLSearchParams(new TextDecoder().decode(body));
  const values = new Map<string, string | string[]>();
  for (const [key, value] of fields) {
    if (key === PUBLIC_FORM_PROOF_FIELD) continue;
    const previous = values.get(key);
    if (previous === undefined) values.set(key, value);
    else if (Array.isArray(previous)) previous.push(value);
    else values.set(key, [previous, value]);
  }
  const data = Object.fromEntries(values);
  const proofs = fields.getAll(PUBLIC_FORM_PROOF_FIELD);
  let proof: unknown;
  if (proofs.length > 1) proof = null;
  else if (proofs[0]) {
    try {
      proof = JSON.parse(
        new TextDecoder().decode(Uint8Array.from(atob(proofs[0]), (char) => char.charCodeAt(0))),
      );
    } catch {
      // Verification rejects malformed proofs after the honeypot cheap check.
      proof = null;
    }
  }
  return { data, ...(proof === undefined ? {} : { proof }) };
}
import { PUBLIC_FORM_PROOF_FIELD } from '../http/public-forms.ts';
