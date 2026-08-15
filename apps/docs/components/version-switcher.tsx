'use client';

import { Popover, PopoverContent, PopoverTrigger } from 'fumadocs-ui/components/ui/popover';
import { ChevronsUpDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export default function VersionSwitcher() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isDocsRoute = pathname === '/docs' || pathname.startsWith('/docs/');

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger aria-label="Select documentation version" className="version-trigger">
        <span aria-hidden="true" className="version-slash" />
        <span>v1.0</span>
        <small>beta</small>
        <ChevronsUpDown aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="version-popover" sideOffset={8}>
        <span className="version-menu-label">Documentation version</span>
        <Link className="version-option" href="/docs" onClick={() => setOpen(false)}>
          <i className={isDocsRoute ? 'is-current' : ''} />
          <span>
            <strong>v1.0 beta</strong>
            <small>Current documentation</small>
          </span>
          <b>Current</b>
        </Link>
      </PopoverContent>
    </Popover>
  );
}
