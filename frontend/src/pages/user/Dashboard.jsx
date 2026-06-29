import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { auth, db } from "../../firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import {
  punchIn as apiPunchIn,
  punchOut as apiPunchOut,
  getTodaySummary,
} from "../../services/attendanceService";

// ══════════════════════════════════════════════
// ── Helpers
// ══════════════════════════════════════════════

function formatTime12(time24) {
  if (!time24) return "—";
  const [h, m] = time24.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${suffix}`;
}

function formatDateLabel(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFullDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatClockTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

const ROWS_PER_PAGE = 10;

// ══════════════════════════════════════════════
// ── Toast Component
// ══════════════════════════════════════════════

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const colors = {
    success: "bg-emerald-500",
    error: "bg-red-500",
    warning: "bg-amber-500",
  };

  return (
    <div className="fixed top-6 right-6 z-100 animate-[slideIn_0.3s_ease-out]">
      <div
        className={`${colors[toast.type] || colors.success} text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm`}
      >
        <span className="text-lg">
          {toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "⚠"}
        </span>
        <p className="text-sm font-medium">{toast.message}</p>
        <button
          onClick={onClose}
          className="ml-auto text-white/70 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// ── Metric Card Component
// ══════════════════════════════════════════════

function MetricCard({ icon, label, value, unit, color, bgColor }) {
  return (
    <div
      className={`${bgColor} rounded-xl p-4 border border-zinc-100 dark:border-zinc-800 shadow-sm transition-transform hover:scale-[1.02] hover:shadow-md`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
          {icon}
        </div>
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        {value}
        <span className="text-sm font-normal text-zinc-400 ml-1">{unit}</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// ── Skeleton Row
// ══════════════════════════════════════════════

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 9 }).map((_, i) => (
        <td key={i} className="px-4 py-4">
          <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

// ══════════════════════════════════════════════
// ── Main Dashboard Component
// ══════════════════════════════════════════════

export default function UserDashboard() {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();

  // ── State ──
  const [todaySummary, setTodaySummary] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // History filters & pagination
  const [sortField, setSortField] = useState("date");
  const [sortDirection, setSortDirection] = useState("desc");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [page, setPage] = useState(1);

  // ── Live Clock ──
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Fetch today's status on mount ──
  useEffect(() => {
    if (!currentUser) return;
    const fetchToday = async () => {
      try {
        const data = await getTodaySummary();
        setTodaySummary(data.summary);
        setSchedule(data.schedule);
      } catch (err) {
        console.error("Error fetching today's summary:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchToday();
  }, [currentUser]);

  // ── Real-time listener for attendance history ──
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, "dailySummary"),
      where("userId", "==", currentUser.uid),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const records = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setHistory(records);
        setHistoryLoading(false);

        // Also update today's summary if it changed
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const todayRecord = records.find(
          (r) => r.date === todayStr || r.status === "In Progress"
        );
        if (todayRecord) {
          setTodaySummary(todayRecord);
        }
      },
      (err) => {
        console.error("Error listening to history:", err);
        setHistoryLoading(false);
      }
    );

    return unsubscribe;
  }, [currentUser]);

  // ── Handlers ──
  const handleLogout = async () => {
    setError("");
    try {
      await signOut(auth);
      navigate("/login");
    } catch (err) {
      setError("Failed to log out");
    }
  };

  const handlePunchIn = async () => {
    setPunching(true);
    setError("");
    try {
      const data = await apiPunchIn();
      setTodaySummary(data.summary);
      setToast({ message: data.message, type: "success" });
    } catch (err) {
      const msg =
        err.response?.data?.message || err.message || "Failed to punch in";
      setToast({ message: msg, type: "error" });
    } finally {
      setPunching(false);
    }
  };

  const handlePunchOut = async () => {
    setPunching(true);
    setError("");
    try {
      const data = await apiPunchOut();
      setTodaySummary(data.summary);
      setToast({ message: data.message, type: "success" });
    } catch (err) {
      const msg =
        err.response?.data?.message || err.message || "Failed to punch out";
      setToast({ message: msg, type: "error" });
    } finally {
      setPunching(false);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setPage(1);
  };

  const clearFilters = () => {
    setFilterFrom("");
    setFilterTo("");
    setPage(1);
  };

  // ── Derived Data ──
  const isInProgress = todaySummary?.status === "In Progress";
  const isCompleted = todaySummary?.status === "Completed";
  const canPunchIn = !isInProgress && !isCompleted && !loading;
  const canPunchOut = isInProgress && !loading;

  const activeSchedule = todaySummary
    ? { shiftStart: todaySummary.scheduleStart, shiftEnd: todaySummary.scheduleEnd }
    : schedule;

  const shiftLabel = useMemo(() => {
    if (!activeSchedule) return null;
    const { shiftStart, shiftEnd } = activeSchedule;
    if (shiftStart === "06:00" && shiftEnd === "14:00") return "Morning Shift";
    if (shiftStart === "14:00" && shiftEnd === "22:00") return "Afternoon Shift";
    if (shiftStart === "22:00" && shiftEnd === "06:00") return "Night Shift";
    return "Custom Shift";
  }, [activeSchedule]);

  // Filtered, sorted, paginated history
  const processedHistory = useMemo(() => {
    let filtered = [...history];

    // Date range filter
    if (filterFrom) {
      filtered = filtered.filter((r) => r.date >= filterFrom);
    }
    if (filterTo) {
      filtered = filtered.filter((r) => r.date <= filterTo);
    }

    // Sort
    filtered.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === "string") {
        valA = valA.toLowerCase();
        valB = (valB || "").toLowerCase();
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [history, filterFrom, filterTo, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(processedHistory.length / ROWS_PER_PAGE));
  const paginatedHistory = processedHistory.slice(
    (page - 1) * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE
  );

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filterFrom, filterTo]);

  // ── Sortable Header Helper ──
  const SortHeader = ({ field, children, className = "" }) => (
    <th
      onClick={() => handleSort(field)}
      className={`px-4 py-3.5 font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap cursor-pointer select-none hover:text-primary transition-colors ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortField === field && (
          <span className="text-primary text-xs">
            {sortDirection === "asc" ? "▲" : "▼"}
          </span>
        )}
      </span>
    </th>
  );

  // ══════════════════════════════════════════════
  // ── Render
  // ══════════════════════════════════════════════

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">
      {/* Toast */}
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="w-full max-w-6xl mt-10">
        {/* ── Header ── */}
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-linear-to-r from-primary to-purple-400">
              User Dashboard
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">
              Welcome back, {userData?.firstName}! 👋
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-5 py-2.5 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors shadow-sm"
          >
            Log Out
          </button>
        </header>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-100 border border-red-200 text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* ── Top Section: Punch + Profile ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">

          {/* ── Punch In/Out Card ── */}
          <div className="lg:col-span-3 glass-card p-8 flex flex-col items-center text-center">
            {/* Live Clock */}
            <div className="mb-2">
              <p className="text-4xl md:text-5xl font-bold font-mono text-zinc-900 dark:text-zinc-50 tracking-tight">
                {formatClockTime(currentTime)}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                {formatFullDate(currentTime)}
              </p>
            </div>

            {/* Schedule Badge */}
            {activeSchedule ? (
              <div className="mt-4 mb-6">
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-primary/10 text-primary border border-primary/20">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {shiftLabel}: {formatTime12(activeSchedule.shiftStart)} – {formatTime12(activeSchedule.shiftEnd)}
                </span>
              </div>
            ) : !loading ? (
              <div className="mt-4 mb-6">
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 border border-amber-200 dark:border-amber-800/30">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  No schedule assigned
                </span>
              </div>
            ) : null}

            {/* Punch Button */}
            {loading ? (
              <div className="w-48 h-14 rounded-2xl bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
            ) : canPunchIn ? (
              <button
                onClick={handlePunchIn}
                disabled={punching || !activeSchedule}
                className="group relative px-12 py-4 text-lg font-bold text-white bg-linear-to-r from-emerald-500 to-green-600 rounded-2xl shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <span className="inline-flex items-center gap-2">
                  {punching ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Punching In...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                      </svg>
                      Punch In
                    </>
                  )}
                </span>
              </button>
            ) : canPunchOut ? (
              <button
                onClick={handlePunchOut}
                disabled={punching}
                className="group relative px-12 py-4 text-lg font-bold text-white bg-linear-to-r from-red-500 to-rose-600 rounded-2xl shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <span className="inline-flex items-center gap-2">
                  {punching ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Punching Out...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Punch Out
                    </>
                  )}
                </span>
              </button>
            ) : isCompleted ? (
              <div className="px-8 py-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                <span className="inline-flex items-center gap-2 text-zinc-500 dark:text-zinc-400 font-medium">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Attendance Completed for Today
                </span>
              </div>
            ) : null}

            {/* Status Info */}
            {isInProgress && todaySummary?.timeIn && (
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                Punched in at{" "}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatTime12(todaySummary.timeIn)}
                </span>
              </p>
            )}
            {isCompleted && todaySummary?.timeIn && todaySummary?.timeOut && (
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                {formatTime12(todaySummary.timeIn)} →{" "}
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  {formatTime12(todaySummary.timeOut)}
                </span>
              </p>
            )}
          </div>

          {/* ── Profile Card ── */}
          <div className="lg:col-span-2 glass-card p-6">
            <h3 className="font-semibold text-lg mb-4 text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-zinc-700 pb-2">
              Your Profile
            </h3>
            <ul className="space-y-3">
              <li className="flex justify-between">
                <span className="text-zinc-500">Name:</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {userData?.firstName} {userData?.lastName}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-500">Email:</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate ml-2" title={userData?.email}>
                  {userData?.email}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-500">Time Zone:</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {userData?.timeZone}
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-zinc-500">Role:</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {userData?.role}
                </span>
              </li>
            </ul>

            {/* Today's Status */}
            <div className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-700">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                Today's Status
              </p>
              {loading ? (
                <div className="h-6 w-24 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
              ) : isInProgress ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  In Progress
                </span>
              ) : isCompleted ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Completed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-zinc-400" />
                  Not Started
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Today's Metrics ── */}
        <div className="glass-card p-6 mb-6">
          <h3 className="font-semibold text-lg mb-4 text-zinc-800 dark:text-zinc-200">
            Today's Attendance Metrics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard
              label="Regular"
              value={todaySummary?.regularHours?.toFixed(2) ?? "0.00"}
              unit="hrs"
              color="bg-blue-100 dark:bg-blue-900/30"
              bgColor="bg-blue-50/50 dark:bg-blue-950/20"
              icon={
                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <MetricCard
              label="Overtime"
              value={todaySummary?.overtimeHours?.toFixed(2) ?? "0.00"}
              unit="hrs"
              color="bg-orange-100 dark:bg-orange-900/30"
              bgColor="bg-orange-50/50 dark:bg-orange-950/20"
              icon={
                <svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
            />
            <MetricCard
              label="Night Diff"
              value={todaySummary?.nightDifferentialHours?.toFixed(2) ?? "0.00"}
              unit="hrs"
              color="bg-indigo-100 dark:bg-indigo-900/30"
              bgColor="bg-indigo-50/50 dark:bg-indigo-950/20"
              icon={
                <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              }
            />
            <MetricCard
              label="Late"
              value={todaySummary?.lateMinutes ?? 0}
              unit="min"
              color="bg-red-100 dark:bg-red-900/30"
              bgColor="bg-red-50/50 dark:bg-red-950/20"
              icon={
                <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <MetricCard
              label="Undertime"
              value={todaySummary?.undertimeMinutes ?? 0}
              unit="min"
              color="bg-rose-100 dark:bg-rose-900/30"
              bgColor="bg-rose-50/50 dark:bg-rose-950/20"
              icon={
                <svg className="w-4 h-4 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <MetricCard
              label="Total Worked"
              value={todaySummary?.totalWorkedHours?.toFixed(2) ?? "0.00"}
              unit="hrs"
              color="bg-emerald-100 dark:bg-emerald-900/30"
              bgColor="bg-emerald-50/50 dark:bg-emerald-950/20"
              icon={
                <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </div>
        </div>

        {/* ── Attendance History ── */}
        <div className="glass-card overflow-hidden mb-10">
          {/* History Header & Filters */}
          <div className="p-4 md:p-6 border-b border-zinc-200 dark:border-zinc-700/50">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="font-semibold text-lg text-zinc-800 dark:text-zinc-200">
                Attendance History
              </h3>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-zinc-500 dark:text-zinc-400">From:</label>
                  <input
                    type="date"
                    value={filterFrom}
                    onChange={(e) => setFilterFrom(e.target.value)}
                    className="input-field text-sm py-1.5! px-3! w-auto!"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-zinc-500 dark:text-zinc-400">To:</label>
                  <input
                    type="date"
                    value={filterTo}
                    onChange={(e) => setFilterTo(e.target.value)}
                    className="input-field text-sm py-1.5! px-3! w-auto!"
                  />
                </div>
                {(filterFrom || filterTo) && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-primary hover:text-primary-hover font-medium transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700/50 bg-zinc-50/80 dark:bg-zinc-900/50">
                  <SortHeader field="date">Date</SortHeader>
                  <SortHeader field="timeIn">Time In</SortHeader>
                  <SortHeader field="timeOut">Time Out</SortHeader>
                  <SortHeader field="regularHours">Regular</SortHeader>
                  <SortHeader field="overtimeHours">OT</SortHeader>
                  <SortHeader field="nightDifferentialHours">ND</SortHeader>
                  <SortHeader field="lateMinutes">Late</SortHeader>
                  <SortHeader field="undertimeMinutes">Undertime</SortHeader>
                  <SortHeader field="status">Status</SortHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {historyLoading ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : paginatedHistory.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                          <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                        </div>
                        <p className="text-zinc-500 dark:text-zinc-400 font-medium">
                          {filterFrom || filterTo
                            ? "No records match the selected date range."
                            : "No attendance records yet."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedHistory.map((record) => (
                    <tr
                      key={record.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-4 py-3.5 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                        {formatDateLabel(record.date)}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap font-mono text-xs">
                        {formatTime12(record.timeIn)}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap font-mono text-xs">
                        {record.timeOut ? formatTime12(record.timeOut) : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {record.regularHours?.toFixed(2) ?? "0.00"} h
                      </td>
                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {record.overtimeHours?.toFixed(2) ?? "0.00"} h
                      </td>
                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {record.nightDifferentialHours?.toFixed(2) ?? "0.00"} h
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`text-xs font-medium ${
                            (record.lateMinutes || 0) > 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-zinc-500 dark:text-zinc-400"
                          }`}
                        >
                          {record.lateMinutes ?? 0} min
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`text-xs font-medium ${
                            (record.undertimeMinutes || 0) > 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-zinc-500 dark:text-zinc-400"
                          }`}
                        >
                          {record.undertimeMinutes ?? 0} min
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            record.status === "Completed"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                              : record.status === "In Progress"
                                ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              record.status === "Completed"
                                ? "bg-emerald-500"
                                : record.status === "In Progress"
                                  ? "bg-amber-500 animate-pulse"
                                  : "bg-zinc-400"
                            }`}
                          />
                          {record.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {!historyLoading && processedHistory.length > 0 && (
            <div className="px-4 md:px-6 py-3 border-t border-zinc-200 dark:border-zinc-700/50 bg-zinc-50/50 dark:bg-zinc-900/30 flex items-center justify-between">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Showing {(page - 1) * ROWS_PER_PAGE + 1}–
                {Math.min(page * ROWS_PER_PAGE, processedHistory.length)} of{" "}
                {processedHistory.length} record{processedHistory.length !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 px-2">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Keyframe Styles ── */}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
