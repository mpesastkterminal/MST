import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  asChild?: false;
};

type ButtonLinkProps = ComponentPropsWithoutRef<typeof Link> & {
  asChild: true;
};

export function Button(props: ButtonProps | ButtonLinkProps) {
  const className = cn(
    "inline-flex h-10 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-200",
    props.className
  );

  if (props.asChild) {
    const { asChild, ...linkProps } = props;
    return <Link {...linkProps} className={className} />;
  }

  const { asChild, ...buttonProps } = props;
  return <button {...buttonProps} className={className} />;
}
