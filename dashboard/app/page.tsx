export default function Home() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-semibold mb-8 tracking-tight">Overview</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        <div className="p-6 border border-[var(--border)] rounded-xl bg-opacity-50">
          <h3 className="text-sm text-gray-400 font-medium mb-2">Total Prospects</h3>
          <p className="text-3xl font-bold">0</p>
        </div>
        <div className="p-6 border border-[var(--border)] rounded-xl bg-opacity-50">
          <h3 className="text-sm text-gray-400 font-medium mb-2">Active Audits</h3>
          <p className="text-3xl font-bold">0</p>
        </div>
        <div className="p-6 border border-[var(--border)] rounded-xl bg-opacity-50 flex items-center justify-between">
          <div>
             <h3 className="text-sm text-gray-400 font-medium mb-2">Engine Status</h3>
             <p className="text-lg font-bold text-gray-300">Idle</p>
          </div>
          <button className="px-4 py-2 bg-white text-black text-sm font-medium rounded-md hover:bg-gray-200 transition-colors">
            Start Engine
          </button>
        </div>
      </div>

      <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
      <div className="border border-[var(--border)] rounded-xl p-8 text-center text-gray-500 text-sm">
        No recent activity. Enter a keyword to start generating prospects.
      </div>
    </div>
  );
}
