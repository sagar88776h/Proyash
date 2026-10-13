import { useEffect } from 'react';

const SUFFIX = 'PRAYASH';

/** Sets the document title for the current page. */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : `${SUFFIX} — Together for Humanity`;
  }, [title]);
}
