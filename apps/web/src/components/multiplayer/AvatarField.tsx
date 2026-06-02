"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { AvatarPicker } from "@/components/AvatarPicker";
import type { AvatarChoice } from "@/lib/multiplayer/lobby";

/** Avatar preview that opens the shared picker modal to change it. */
export function AvatarField({
  value,
  onChange,
  size = 72,
}: {
  value: AvatarChoice;
  onChange: (v: AvatarChoice) => void;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center gap-1 rounded-2xl border border-white/15 bg-white/5 p-2 transition hover:bg-white/10"
        aria-label="Choose your avatar"
      >
        <Avatar styleKey={value.styleKey} seed={value.seed} size={size} className="rounded-xl" />
        <span className="text-xs font-medium text-white/70">Change avatar</span>
      </button>
      {open && (
        <AvatarPicker
          initialStyle={value.styleKey}
          initialSeed={value.seed}
          onClose={(sel) => {
            onChange(sel);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
