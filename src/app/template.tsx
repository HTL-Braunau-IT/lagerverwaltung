import type { ReactNode } from "react";

import { ScrollToTopOnRouteChange } from "~/components/layout/scroll-to-top-on-route-change";

export default function Template({ children }: { children: ReactNode }) {
  return (
    <>
      <ScrollToTopOnRouteChange />
      {children}
    </>
  );
}

