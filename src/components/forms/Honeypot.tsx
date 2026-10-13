import type { Ref } from 'react';

/** Hidden from people (including screen-reader users); automated spam tools often fill it in. */
export function Honeypot({ inputRef }: { inputRef: Ref<HTMLInputElement> }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute top-auto -left-[10000px] h-px w-px overflow-hidden">
      <label>
        Leave this field empty
        <input ref={inputRef} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}
