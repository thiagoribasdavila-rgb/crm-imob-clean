export default function Page() {
  return (
    <pre>
      {process.env.NEXT_PUBLIC_SUPABASE_URL}
    </pre>
  );
}
