"use client";

import { useEffect } from "react";
import type { ActivityItem } from "./types";

interface Props {
  /** The item being rated; null/undefined hides the modal. */
  item: ActivityItem | null;
  onClose: () => void;
}

/**
 * @deprecated Superseded by CalibrationModal. Do not import this file.
 * The Calibrate-tier Rate flow now lives in
 * `components/activity/CalibrationModal.tsx`, which talks to the
 * `submit_calibration` RPC (migration 008) and surfaces a confirmation
 * toast on save. This stub is kept temporarily because the host
 * filesystem doesn't allow deletes from this session; a follow-up commit
 * can drop the file once the workspace permits it.
 */
export default function RateModal({ item, onClose }: Props) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rate-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-token-6"
      style={{ background: "rgba(15, 20, 25, 0.7)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={[
          "w-full max-w-[480px] bg-ink-2 border border-line rounded-token-5",
          "p-token-10 text-stone shadow-2xl",
        ].join(" ")}
      >
        <div className="flex justify-between items-start mb-token-5">
          <h2
            id="rate-modal-title"
            className="font-serif font-normal"
            style={{ fontSize: "var(--fs-h2)" }}
          >
            Rate this
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="bg-transparent border-0 text-stone-3 text-[20px] leading-none cursor-pointer hover:text-stone"
          >
            ×
          </button>
        </div>

        <div className="text-stone-3 text-meta mb-token-3">
          From{" "}
          <span className="text-stone-2">{item.author.displayName}</span> on{" "}
          <span className="lowercase">{item.platform}</span>
        </div>

        <div className="bg-ink-3 border border-line rounded-token-3 p-token-6 mb-token-6">
          <div className="text-stone-4 text-micro uppercase tracking-[0.6px] mb-token-2">
            Placeholder
          </div>
          <p className="text-body text-stone-2 leading-relaxed">
            The full rating experience ships in the next iteration. For now,
            this confirms the row → modal wire is connected. The real form
            will let you mark borderline content as crossing your line, with
            confidence and category nuance.
          </p>
        </div>

        <div className="flex justify-end gap-token-3">
          <button
            type="button"
            onClick={onClose}
            className={[
              "px-token-6 py-token-2 rounded-token-3 cursor-pointer",
              "bg-transparent border border-line-2 text-stone text-meta font-semibold",
              "hover:bg-ink-3",
            ].join(" ")}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
