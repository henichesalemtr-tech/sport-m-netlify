import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** دمج أصناف Tailwind بأمان (B). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
