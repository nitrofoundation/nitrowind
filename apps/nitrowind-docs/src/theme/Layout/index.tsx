import React from "react";
import { useLocation } from "@docusaurus/router";
import OriginalLayout from "@theme-original/Layout";

type LayoutProps = React.ComponentProps<typeof OriginalLayout>;

/** Keep the marketing footer on the homepage; docs pages remain content-first. */
export default function Layout(props: LayoutProps): React.ReactNode {
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  return <OriginalLayout {...props} noFooter={isHome ? props.noFooter : true} />;
}
