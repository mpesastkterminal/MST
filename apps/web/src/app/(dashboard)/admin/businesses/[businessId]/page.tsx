import { BusinessDetailClient } from "@/features/admin/components/business-detail-client";

export default async function AdminBusinessDetailPage({
  params
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Super Admin</p>
        <h1 className="text-3xl font-semibold text-slate-950">
          Business Detail
        </h1>
      </div>
      <BusinessDetailClient businessId={businessId} />
    </section>
  );
}
