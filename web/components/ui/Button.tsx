import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "soft";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export function Button({ variant = "primary", className = "", ...props }: Props) {
  const variantClass =
    variant === "outline" ? "btn-outline" : variant === "soft" ? "btn-soft" : "btn-primary";
  return <button className={`btn ${variantClass} ${className}`} {...props} />;
}
