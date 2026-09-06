import type { Metadata } from "next";
import MacroTracker from "@/components/MacroTracker";

export const metadata: Metadata = {
  title: "Macros · Personal Hub",
};

export default function MacrosPage() {
  return <MacroTracker />;
}
