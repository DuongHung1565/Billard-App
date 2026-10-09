import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
const variants = cva('button', { variants: { variant: { default: 'primary', secondary: 'secondary', ghost: 'ghost', destructive: 'danger' } }, defaultVariants: { variant: 'default' } });
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof variants> {}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, ...props },ref) => <button ref={ref} className={twMerge(clsx(variants({ variant }),className))} {...props} />);
Button.displayName = 'Button';
