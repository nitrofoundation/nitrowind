'use client';

import { useEffect } from 'react';

const analyticsSource = 'https://analytics.nitrowind.dev/script.js';

export default function Analytics() {
  useEffect(() => {
    if (document.querySelector(`script[src="${analyticsSource}"]`)) return;

    const script = document.createElement('script');
    script.defer = true;
    script.src = analyticsSource;
    script.dataset.websiteId = 'b5107f46-7223-408e-8af0-a68bd8672ba5';
    document.head.append(script);

    return () => script.remove();
  }, []);

  return null;
}
