import "./reading-theme.css";

export default function ReadingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="readingTheme">{children}</div>;
}
