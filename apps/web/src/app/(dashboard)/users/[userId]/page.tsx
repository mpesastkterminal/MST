import { UserDetailClient } from "@/features/users/components/user-detail-client";

export default async function UserDetailPage({
  params
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">Business Owner</p>
        <h1 className="text-3xl font-semibold text-slate-950">User Detail</h1>
      </div>
      <UserDetailClient userId={userId} />
    </section>
  );
}
