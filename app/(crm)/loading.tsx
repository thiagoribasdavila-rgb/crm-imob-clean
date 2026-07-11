import { AtlasSkeleton } from "@/components/ui/AtlasUI";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-8">
        <AtlasSkeleton className="h-5 w-40" />
        <AtlasSkeleton className="mt-5 h-12 w-3/4" />
        <AtlasSkeleton className="mt-4 h-5 w-1/2" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => <AtlasSkeleton key={item} className="h-36 w-full rounded-[22px]" />)}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
        <AtlasSkeleton className="h-[420px] w-full rounded-[22px]" />
        <AtlasSkeleton className="h-[420px] w-full rounded-[22px]" />
      </div>
    </div>
  );
}
