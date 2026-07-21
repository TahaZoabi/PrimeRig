/**
 * components/admin/PeriodFilter.tsx
 *
 * Shared date-range filter control (dropdown + optional custom range inputs).
 * Used identically by AdminDashboard (Overview) and AdminOrders — each tab
 * owns its own period state, but both render through this one component so
 * the filtering UI/behavior is guaranteed to be identical.
 */
import { Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Period =
  | "today"
  | "7d"
  | "30d"
  | "3m"
  | "6m"
  | "1y"
  | "all"
  | "custom";

export interface PeriodOption {
  value: Period;
  label: string;
}

interface PeriodFilterProps {
  options: PeriodOption[];
  period: Period;
  onPeriodChange: (p: Period) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
  isFetching?: boolean;
}

const PeriodFilter = ({
  options,
  period,
  onPeriodChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  isFetching,
}: PeriodFilterProps) => {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <Select
          value={period}
          onValueChange={(v) => onPeriodChange(v as Period)}
        >
          <SelectTrigger className="w-44 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {period === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={customStart}
            onChange={(e) => onCustomStartChange(e.target.value)}
            className="w-40 h-9"
            max={customEnd || undefined}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            value={customEnd}
            onChange={(e) => onCustomEndChange(e.target.value)}
            className="w-40 h-9"
            min={customStart || undefined}
          />
        </div>
      )}

      {isFetching && (
        <span className="text-xs text-muted-foreground">Updating…</span>
      )}
    </div>
  );
};

export default PeriodFilter;
