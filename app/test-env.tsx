// app/test-env/page.tsx
export default function Page() {
  return (
    <pre>
      {JSON.stringify({
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 10)
      }, null, 2)}
    </pre>
  );
}
