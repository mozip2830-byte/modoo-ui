import * as React from "react";

type BaseProps = {
  className?: string;
};

type InputProps = BaseProps &
  React.InputHTMLAttributes<HTMLInputElement> & {
    as?: "input";
  };

type TextAreaProps = BaseProps &
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    as: "textarea";
  };

export function Input(props: InputProps): JSX.Element;
export function Input(props: TextAreaProps): JSX.Element;
export function Input(props: InputProps | TextAreaProps) {
  const { className = "" } = props;

  if ("as" in props && props.as === "textarea") {
    const { as, ...rest } = props;
    return <textarea className={`input textarea ${className}`} {...rest} />;
  }

  const { as, ...rest } = props as InputProps;
  return <input className={`input ${className}`} {...rest} />;
}
