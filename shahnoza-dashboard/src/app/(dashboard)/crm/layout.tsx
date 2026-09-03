export default function CrmSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="mx-auto max-w-[1400px]">{children}</div>;
}
