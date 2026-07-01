import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DashboardStats from "@/components/dashboard/DashboardStats";
import LeadsByStatusChart from "@/components/dashboard/charts/LeadsByStatusChart";
import LeadsBySourceCharts from "@/components/dashboard/charts/LeadsBySourceCharts";

export default function Page() {
  return (
    <div style={{ padding: 20 }}>
      <DashboardHeader />
      <DashboardStats />
      <LeadsByStatusChart />
      <LeadsBySourceCharts />
    </div>
  );
}
