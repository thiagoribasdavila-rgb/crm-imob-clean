import React from "react";

type StatCardProps = {
  title: string;
  value: string | number;
  description?: string;
  trend?: number;
};

export function StatCard({
  title,
  value,
  description,
  trend,
}: StatCardProps) {
  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm flex flex-col gap-2">
      
      {/* Title */}
      <span className="text-sm text-gray-500 font-medium">
        {title}
      </span>

      {/* Value */}
      <span className="text-2xl font-bold text-gray-900">
        {value}
      </span>

      {/* Description + Trend */}
      {(description || trend !== undefined) && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          
          {description && (
            <span>{description}</span>
          )}

          {trend !== undefined && (
            <span
              className={`font-semibold ${
                trend >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {trend >= 0 ? "+" : ""}
              {trend}%
            </span>
          )}

        </div>
      )}

    </div>
  );
}
