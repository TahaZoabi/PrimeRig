/**
 * lib/pcCompatibility.ts
 *
 * Single source of truth for every PC Builder compatibility rule. Used by:
 *   - The PREVENTIVE layer (PCBuilderPage.tsx): as soon as something is
 *     selected, every option in every other category's dropdown is checked
 *     against it and disabled (with a reason) if it wouldn't fit.
 *   - The FINAL validation layer (PCBuilderPage.tsx): re-checks the whole
 *     build the same way, right before "Add All to Cart".
 * Every rule is written exactly once, here. Neither layer re-implements a
 * rule — they just call getIncompatibilityReason with a different scope
 * (one candidate vs. the whole finished build) — so the two layers can
 * never drift out of sync with each other.
 */
import type { Product } from "@/hooks/useProducts";

export type CategoryKey =
  | "cpu"
  | "gpu"
  | "motherboard"
  | "ram"
  | "storage"
  | "psu"
  | "case"
  | "cooler";

export type SelectedProducts = Partial<Record<CategoryKey, Product>>;

// A case's form_factor is read as "the largest board it supports" — ATX
// cases fit mATX/ITX too, mATX cases fit ITX too, and so on.
const FORM_FACTOR_RANK: Record<string, number> = {
  itx: 1,
  "mini-itx": 1,
  matx: 2,
  "m-atx": 2,
  "micro-atx": 2,
  atx: 3,
  eatx: 4,
  "e-atx": 4,
};
const formFactorRank = (ff: string | null | undefined): number | null => {
  if (!ff) return null;
  return FORM_FACTOR_RANK[ff.trim().toLowerCase()] ?? null;
};

// GPU length / case max-GPU-length live in the generic `specs` JSON field
// (already part of the product schema) as gpu_length_mm / max_gpu_length_mm.
const specNumber = (p: Product | undefined, key: string): number | null => {
  const raw = p?.specs?.[key];
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const totalWattage = (products: Array<Product | undefined>) =>
  products.reduce((sum, p) => sum + (p ? Number(p.wattage) || 0 : 0), 0);

/**
 * Is `candidate` (being considered FOR `category`) compatible with
 * everything already in `selected`? `selected` must NOT include `category`
 * itself — the candidate is what would go there instead of whatever (if
 * anything) is currently picked for it.
 *
 * Returns a short, human-readable reason if incompatible, or null if fine.
 */
export function getIncompatibilityReason(
  category: CategoryKey,
  candidate: Product,
  selected: SelectedProducts,
): string | null {
  const cpu = selected.cpu;
  const mb = selected.motherboard;
  const ram = selected.ram;
  const cooler = selected.cooler;
  const gpu = selected.gpu;
  const psu = selected.psu;
  const caseProduct = selected.case;

  // ---- Socket: CPU <-> Motherboard <-> Cooler ----
  if (
    category === "cpu" &&
    mb?.socket_type &&
    candidate.socket_type &&
    candidate.socket_type !== mb.socket_type
  ) {
    return `Requires ${mb.socket_type} socket`;
  }
  if (
    category === "motherboard" &&
    cpu?.socket_type &&
    candidate.socket_type &&
    candidate.socket_type !== cpu.socket_type
  ) {
    return `Requires ${cpu.socket_type} socket`;
  }
  if (category === "cooler") {
    const refSocket = cpu?.socket_type || mb?.socket_type;
    if (
      refSocket &&
      candidate.socket_type &&
      candidate.socket_type !== refSocket
    ) {
      return `Requires ${refSocket} socket`;
    }
  }
  if (
    (category === "cpu" || category === "motherboard") &&
    cooler?.socket_type &&
    candidate.socket_type &&
    candidate.socket_type !== cooler.socket_type
  ) {
    return `Requires ${cooler.socket_type} socket (selected cooler)`;
  }

  // ---- DDR type: RAM <-> Motherboard ----
  if (
    category === "ram" &&
    mb?.ddr_type &&
    candidate.ddr_type &&
    candidate.ddr_type !== mb.ddr_type
  ) {
    return `Requires ${mb.ddr_type} memory`;
  }
  if (
    category === "motherboard" &&
    ram?.ddr_type &&
    candidate.ddr_type &&
    candidate.ddr_type !== ram.ddr_type
  ) {
    return `Requires ${ram.ddr_type} memory`;
  }

  // ---- Form factor: Motherboard <-> Case ----
  if (category === "motherboard" && caseProduct?.form_factor) {
    const caseRank = formFactorRank(caseProduct.form_factor);
    const boardRank = formFactorRank(candidate.form_factor);
    if (caseRank && boardRank && boardRank > caseRank) {
      return `Too large for selected case (${caseProduct.form_factor})`;
    }
  }
  if (category === "case" && mb?.form_factor) {
    const caseRank = formFactorRank(candidate.form_factor);
    const boardRank = formFactorRank(mb.form_factor);
    if (caseRank && boardRank && boardRank > caseRank) {
      return `Too small for selected motherboard (${mb.form_factor})`;
    }
  }

  // ---- GPU length vs. Case max GPU length ----
  if (category === "gpu" && caseProduct) {
    const maxLen = specNumber(caseProduct, "max_gpu_length_mm");
    const gpuLen = specNumber(candidate, "gpu_length_mm");
    if (maxLen && gpuLen && gpuLen > maxLen) {
      return `GPU is too long for selected case (max ${maxLen}mm)`;
    }
  }
  if (category === "case" && gpu) {
    const maxLen = specNumber(candidate, "max_gpu_length_mm");
    const gpuLen = specNumber(gpu, "gpu_length_mm");
    if (maxLen && gpuLen && gpuLen > maxLen) {
      return `GPU is too long for this case (max ${maxLen}mm)`;
    }
  }

  // ---- Wattage: everything else <-> PSU ----
  if (category === "psu") {
    const others = Object.values(selected);
    const needed = totalWattage(others);
    const candidateWatts = Number(candidate.wattage) || 0;
    if (needed > 0 && candidateWatts > 0 && candidateWatts < needed) {
      return `PSU wattage is insufficient (needs ${needed}W+)`;
    }
  } else if (psu?.wattage) {
    const others = Object.values(selected).filter((p) => p !== psu);
    const needed = totalWattage([...others, candidate]);
    const psuWatts = Number(psu.wattage) || 0;
    if (psuWatts > 0 && needed > psuWatts) {
      return `PSU wattage is insufficient (needs ${needed}W, have ${psuWatts}W)`;
    }
  }

  return null;
}

/**
 * Final, whole-build validation. Reuses getIncompatibilityReason for every
 * currently-selected category by treating "everything else selected" as
 * the context and "what's actually in this slot" as the candidate — the
 * exact same check the preventive layer runs per-option, just evaluated
 * over the finished build instead of one dropdown at a time.
 */
export function getBuildWarnings(selected: SelectedProducts): string[] {
  const warnings = new Set<string>();
  (Object.keys(selected) as CategoryKey[]).forEach((category) => {
    const candidate = selected[category];
    if (!candidate) return;
    const rest = { ...selected };
    delete rest[category];
    const reason = getIncompatibilityReason(category, candidate, rest);
    if (reason) warnings.add(`${candidate.name}: ${reason}`);
  });
  return Array.from(warnings);
}
