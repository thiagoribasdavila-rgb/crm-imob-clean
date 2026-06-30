import React from "react";

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
  const isPositive = trend !== undefined ? trend >= 0 : null;

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 font-medium">
          {title}
        </span>

        {trend !== undefined && (
          <span
            className={`text-xs font-semibold ${
              isPositive ? "text-green-600" : "text-red-500"
            }`}
          >
            {isPositive ? "+" : "-"}{Math.abs(trend)}%
          </span>
        )}
      </div>

      {/* VALUE */}
      <div className="mt-2 text-3xl font-bold text-gray-900">
        {value}
      </div>

      {/* DESCRIPTION */}
      {description && (
        <div className="mt-1 text-xs text-gray-400">
          {description}
        </div>
      )}
    </div>
  );
}
