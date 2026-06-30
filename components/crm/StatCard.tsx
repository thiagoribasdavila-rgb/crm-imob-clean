import React from "react";

type StatCardProps = {
  title: string;
  value: string | number;
  description?: string;
  trend?: number; // positivo ou negativo
};

export function StatCard({
  title,
  value,
  description,
  trend,
}: StatCardProps) {
  const isPositive = trend && trend > 0;

  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm flex flex-col gap-2 hover:shadow-md transition">
      
      {/* Title */}
      <span className="text-sm text-gray-500 font-medium">
        {title}
      </span>

      {/* Value */}
      <span className="text-2xl font-bold text-gray-900">
        {value}
      </span>

      {/* Description */}
      {description && (
        <span className="text-xs text-gray-400">
          {description}
        </span>
      )}

      {/* Trend */}
      {typeof trend === "number" && (
        <div
          className={`text-xs font-semibold ${
            isPositive ? "text-green-600" : "text-red-500"
          }`}
        >
          {isPositive ? "▲" : "▼"} {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}
