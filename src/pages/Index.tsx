import Header from "@/components/Header";
import ExpiringSection from "@/components/ExpiringSection";
import QuickActions from "@/components/QuickActions";
import AIInsightCard from "@/components/AIInsightCard";
import RewardSection from "@/components/RewardSection";
import BottomNav from "@/components/BottomNav";

const Index = () => {
  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-0 left-1/3 w-[500px] h-[500px] rounded-full bg-mint/5 blur-[140px] pointer-events-none" />
      <div className="absolute top-60 right-0 w-[300px] h-[300px] rounded-full bg-coral/4 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-40 left-0 w-[250px] h-[250px] rounded-full bg-cream/3 blur-[100px] pointer-events-none" />

      <div className="relative z-10 pb-28">
        <Header />

        <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:px-8 xl:px-16 2xl:px-24 lg:mt-4">
          <div>
            <ExpiringSection />
            <AIInsightCard />
          </div>
          <div>
            <QuickActions />
            <RewardSection />
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Index;
