import { avatarDataUri } from "@/lib/avatar";

export function Avatar({
  styleKey,
  seed,
  size = 48,
  className = "",
}: {
  styleKey: string;
  seed: string;
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI, not a remote image
    <img
      src={avatarDataUri(styleKey, seed)}
      width={size}
      height={size}
      alt=""
      className={className}
      draggable={false}
    />
  );
}
