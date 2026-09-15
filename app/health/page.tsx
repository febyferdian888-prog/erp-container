export const dynamic = "force-dynamic";

export default async function HealthPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
          ERP System
        </h1>

        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 font-semibold">✓ App Server Online</p>
            <p className="text-green-600 text-sm mt-1">Vercel deployment is running</p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800 font-semibold">⚠ Database Setup Needed</p>
            <p className="text-yellow-600 text-sm mt-1">Call the setup endpoint to initialize</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
            <p className="text-blue-800 font-semibold text-sm mb-2">Setup Instructions:</p>
            <code className="text-blue-600 text-xs block bg-white p-2 rounded border">
              curl -X POST \<br/>
              "https://erp-app-blond.vercel.app/api/admin/setup" \<br/>
              -H "x-admin-key: YOUR_ADMIN_KEY" \<br/>
              -H "Content-Type: application/json"
            </code>
          </div>

          <div className="text-center mt-6">
            <a
              href="/auth/login"
              className="text-indigo-600 hover:text-indigo-800 underline text-sm"
            >
              Go to Login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
