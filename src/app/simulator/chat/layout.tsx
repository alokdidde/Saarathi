"use client";

import { useEffect } from "react";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Disable horizontal scroll on this page
    document.documentElement.style.overflowX = "hidden";
    document.body.style.overflowX = "hidden";

    return () => {
      document.documentElement.style.overflowX = "";
      document.body.style.overflowX = "";
    };
  }, []);

  return <>{children}</>;
}
