export function Code({ value }: { value: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-xs">
      <code>{value}</code>
    </pre>
  );
}
