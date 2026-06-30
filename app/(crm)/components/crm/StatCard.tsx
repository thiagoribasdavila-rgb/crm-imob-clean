type StatCardProps = {
  title: string;
  value: string | number;
  description?: string;
  trend?: number;
};

export default function StatCard({
  title,
  value,
  description,
  trend,
}: StatCardProps) {
  const isPositive = trend !== undefined ? trend >= 0 : true;

  return (
    <div className="bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition">

      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500 font-medium">
          {title}
        </span>

        {trend !== undefined && (
          <span
            className={`text-xs font-semibold ${
              isPositive ? "text-green-600" : "text-red-500"
            }`}
          >
            {isPositive ? "+" : ""}
            {trend}%
          </span>
        )}
      </div>

      <div className="text-3xl font-bold text-gray-900 mt-2">
        {value}
      </div>

      {description && (
        <div className="text-xs text-gray-400 mt-1">
          {description}
        </div>
      )}
    </div>
  );
}
