import PlotApp from '@/components/PlotApp';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-900 bg-cover bg-center">
      <div className="min-h-screen bg-slate-900/80 backdrop-blur-[2px]">
        <PlotApp />
      </div>
    </main>
  );
}
