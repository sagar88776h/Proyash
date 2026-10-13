import { useReducedMotion } from 'framer-motion';

/** True when the visitor prefers reduced motion (or before the preference is known). */
export function usePrefersReducedMotion(): boolean {
  const reduced = useReducedMotion();
  return reduced !== false;
}
