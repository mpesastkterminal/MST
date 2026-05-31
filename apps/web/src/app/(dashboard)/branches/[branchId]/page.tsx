import { BranchDetailClient } from "@/features/branches/components/branch-detail-client";

export default async function BranchDetailPage({
  params
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Business Owner</p>
        <h1 className="text-3xl font-semibold text-slate-950">
          Branch Detail
        </h1>
      </div>
      <BranchDetailClient branchId={branchId} />
    </section>
  );
}
