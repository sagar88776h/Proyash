import { useState } from 'react';
import { cn } from '@/lib/cn';
import { publicMediaUrl } from '@/lib/supabase';
import { PhotoPlaceholder } from './PhotoPlaceholder';

type PhotoProps = {
  media: { public_path: string | null; alt_text: string; width?: number | null; height?: number | null } | null | undefined;
  className?: string;
  imgClassName?: string;
  /** Load eagerly (above-the-fold hero images). */
  priority?: boolean;
  placeholderLabel?: string;
  tone?: 'light' | 'dark';
  sizes?: string;
};

/** An approved, published photograph — or a labelled placeholder if none is available. */
export function Photo({ media, className, imgClassName, priority = false, placeholderLabel, tone, sizes }: PhotoProps) {
  const [failed, setFailed] = useState(false);
  const src = publicMediaUrl(media?.public_path);
  return (
    <div className={cn('relative overflow-hidden', className)}>
      {src && !failed ? (
        <img
          src={src}
          alt={media?.alt_text ?? ''}
          width={media?.width ?? undefined}
          height={media?.height ?? undefined}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          sizes={sizes}
          onError={() => setFailed(true)}
          className={cn('h-full w-full object-cover', imgClassName)}
        />
      ) : (
        <PhotoPlaceholder label={placeholderLabel} tone={tone} />
      )}
    </div>
  );
}
