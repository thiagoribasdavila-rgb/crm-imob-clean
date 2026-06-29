// components/crm/StatCard.tsx

export function StatCard({
  title,
  value,
}: {
  title: string
  value: string
}) {
  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm">

      <div className="text-sm text-gray-500">
        {title}
      </div>

      <div className="text-2xl font-bold">
        {value}
      </div>

    </div>
  )
}
