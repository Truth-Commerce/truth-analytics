import React from 'react';

import { corDoCanal } from '@/lib/canal-visual';

/** Dot decorativo com a cor da marca do canal — o nome do canal segue sempre escrito ao lado. */
export function CanalDot({ canal }: { canal: string }) {
  return (
    <span
      aria-hidden="true"
      className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full align-middle"
      style={{ backgroundColor: corDoCanal(canal) }}
    />
  );
}
