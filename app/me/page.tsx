import { MeDashboard } from "./me-dashboard";

export const metadata = { title: "My Workspace · Scholarship DAO" };

export default function Page() {
  return (
    <div className="container mx-auto max-w-6xl px-4 pb-24 pt-10">
      <MeDashboard />
    </div>
  );
}
