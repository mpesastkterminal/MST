import { Sidebar } from "@/components/layout/sidebar";
import { AuthGate } from "./auth-gate";

export default function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthGate>
      <div className="min-h-screen bg-slate-50">
        <Sidebar />
        <main className="min-h-screen px-6 py-6 md:pl-72">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </AuthGate>
  );
}
