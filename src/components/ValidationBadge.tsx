import { getValidationLabel, type PostValidationResult } from "@/lib/postValidation";
import { cn } from "@/lib/utils";

const validationStyles = {
  "Ready to Approve": "border-teal-300/70 bg-teal-300/10 text-teal-100",
  "Missing Required Fields": "border-red-300/70 bg-red-300/10 text-red-100",
  "Needs Human Check": "border-amber-300/70 bg-amber-300/10 text-amber-100",
  "Duplicate Warning": "border-orange-300/70 bg-orange-300/10 text-orange-100",
};

export function ValidationBadge({ result }: { result: PostValidationResult }) {
  const label = getValidationLabel(result);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 font-[var(--font-plex)] text-[11px] font-semibold uppercase tracking-[0.05em]",
        validationStyles[label],
      )}
    >
      {label}
    </span>
  );
}
