"use client";

import type { ComponentProps } from "react";

/** Scorekeeper screens use local data, not a server-side route payload. */
export function navigateScorekeeper(href: string, replace = false) {
  if (replace) window.history.replaceState(null, "", href);
  else window.history.pushState(null, "", href);
  window.scrollTo(0, 0);
}

export function ScorekeeperLink({
  href,
  onClick,
  ...props
}: ComponentProps<"a"> & { href: string }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (props.target && props.target !== "_self") ||
          props.download !== undefined ||
          !href.startsWith("/games/")
        ) {
          return;
        }
        event.preventDefault();
        navigateScorekeeper(href);
      }}
    />
  );
}
