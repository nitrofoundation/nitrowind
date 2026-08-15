import BlogLayout from '@/components/blog-layout';

export default function Layout({ children }: LayoutProps<'/blog'>) {
  return <BlogLayout>{children}</BlogLayout>;
}
