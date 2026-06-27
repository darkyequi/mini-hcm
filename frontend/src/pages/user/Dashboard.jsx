import React, { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { auth } from "../../firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

export default function UserDashboard() {
  const [error, setError] = useState("");
  const { userData } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    setError("");
    try {
      await signOut(auth);
      navigate("/login");
    } catch (err) {
      setError("Failed to log out");
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-4xl mt-10">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-linear-to-r from-primary to-purple-400">
              User Dashboard
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="px-5 py-2.5 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors shadow-sm"
          >
            Log Out
          </button>
        </header>

        <div className="glass-card p-8">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-100 border border-red-200 text-red-600 text-sm">
              {error}
            </div>
          )}
          <h2 className="text-2xl font-semibold mb-6 dark:text-white">
            Welcome back, {userData?.firstName}! 👋
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm">
              <h3 className="font-semibold text-lg mb-4 text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-zinc-700 pb-2">
                Your Profile
              </h3>
              <ul className="space-y-3">
                <li className="flex justify-between">
                  <span className="text-zinc-500">Name:</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{userData?.firstName} {userData?.lastName}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-zinc-500">Email:</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{userData?.email}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-zinc-500">Time Zone:</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{userData?.timeZone}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-zinc-500">Role:</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    {userData?.role}
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm flex items-center justify-center">
              <p className="text-center text-zinc-500 italic">
                More user-specific features coming soon.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
