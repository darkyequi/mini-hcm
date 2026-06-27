import React, { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { auth } from "../../firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

export default function AdminDashboard() {
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
      <div className="w-full max-w-5xl mt-10">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-linear-to-r from-red-500 to-orange-500">
              Admin Portal
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="px-5 py-2.5 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors shadow-sm"
          >
            Log Out
          </button>
        </header>

        <div className="bg-white/70 dark:bg-surface-dark backdrop-blur-xl border border-zinc-200 dark:border-border-dark shadow-xl rounded-2xl p-8 border-t-4 border-t-red-500">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-100 border border-red-200 text-red-600 text-sm">
              {error}
            </div>
          )}
          <h2 className="text-2xl font-semibold mb-2 dark:text-white">
            Administrator: {userData?.firstName} {userData?.lastName}
          </h2>
          <p className="text-zinc-500 mb-8">System Management Console</p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Overview Card */}
            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm md:col-span-1">
              <h3 className="font-semibold text-lg mb-4 text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-zinc-700 pb-2">
                Your Details
              </h3>
              <ul className="space-y-3">
                <li className="flex justify-between">
                  <span className="text-zinc-500">Email:</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate ml-2" title={userData?.email}>{userData?.email}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-zinc-500">Role:</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                    {userData?.role}
                  </span>
                </li>
              </ul>
            </div>

            {/* Actions Card */}
            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm md:col-span-2">
               <h3 className="font-semibold text-lg mb-4 text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-zinc-700 pb-2">
                Quick Actions
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <button className="p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 hover:border-red-300 transition-colors flex flex-col items-center justify-center text-zinc-700 dark:text-zinc-300 gap-2">
                  <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  Manage Users
                </button>
                <button
                  onClick={() => navigate("/admin/schedule-management")}
                  className="p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 hover:border-red-300 transition-colors flex flex-col items-center justify-center text-zinc-700 dark:text-zinc-300 gap-2"
                >
                  <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  Manage Schedules
                </button>
                <button className="p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 hover:border-red-300 transition-colors flex flex-col items-center justify-center text-zinc-700 dark:text-zinc-300 gap-2">
                  <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Attendance Record
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
