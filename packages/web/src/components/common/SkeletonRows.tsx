import { Skeleton } from "../ui/skeleton";

const ROW_COUNT = 3;

export function SkeletonRows() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: ROW_COUNT }).map((_, index) => (
        <div key={index} className="rounded-lg bg-card p-5 shadow-sm">
          <Skeleton className="mb-2 h-4 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
