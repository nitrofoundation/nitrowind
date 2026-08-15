import DocsLayout from '@/components/docs-layout';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return <DocsLayout>{children}</DocsLayout>;
}
