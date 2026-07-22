/**
 * components/admin/RecentActivity.tsx
 *
 * Live feed of recent admin/customer actions (orders placed, products
 * archived/restored, categories/suppliers changed, etc). Deliberately not
 * period-scoped — it's a global "what just happened" feed, independent of
 * the dashboard's date filter, so it gets its own small data source and
 * polls on a short interval for a "live" feel.
 */
import { useQuery } from "@tanstack/react-query";
import { activityApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ShoppingBag, Package, Tag, Truck } from "lucide-react";

interface ActivityEntry {
  id: string;
  type: string;
  message: string;
  created_at: string;
}

const iconFor: Record<string, typeof ShoppingBag> = {
  order: ShoppingBag,
  product: Package,
  category: Tag,
  supplier: Truck,
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const RecentActivity = () => {
  const { data: entries, isLoading } = useQuery<ActivityEntry[]>({
    queryKey: ["recent-activity"],
    queryFn: async () => {
      const { data } = await activityApi.get(15);
      return data;
    },
    refetchInterval: 30_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" /> Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-muted" />
            ))}
          </div>
        ) : !entries || entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No activity recorded yet
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const Icon = iconFor[entry.type] ?? Activity;
              return (
                <div key={entry.id} className="flex items-start gap-3">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">{entry.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(entry.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentActivity;
