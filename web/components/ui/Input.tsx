import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  as?: "input";
};

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  as: "textarea";
};

export function Input({ as, className = "", ...props }: InputProps | TextAreaProps) {
  if (as === "textarea") {
    return <textarea className={`input textarea ${className}`} {...props} />;
  }
  return <input className={`input ${className}`} {...props} />;
}
