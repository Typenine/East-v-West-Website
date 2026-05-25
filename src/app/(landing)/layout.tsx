import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fantasy Football League Website",
  description: "A beautiful, feature-rich website for your fantasy football dynasty league",
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Landing page uses a minimal layout without the main navbar/footer
  return <>{children}</>;
}
