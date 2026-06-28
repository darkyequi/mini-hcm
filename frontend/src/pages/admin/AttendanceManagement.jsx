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
import axios from "axios";

// ══════════════════════════════════════════════
// ── Constants & Helpers
// ══════════════════════════════════════════════

const SHIFTS = [
  { name: "Morning", label: "6:00 AM – 2:00 PM", start: "06:00", end: "14:00" },
  { name: "Afternoon", label: "2:00 PM – 10:00 PM", start: "14:00", end: "22:00" },
  { name: "Night", label: "10:00 PM – 6:00 AM", start: "22:00", end: "06:00" },
];

const STATUS_OPTIONS = ["All", "Completed", "In Progress"];


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
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getShiftLabel(start, end) {
  const match = SHIFTS.find((s) => s.start === start && s.end === end);
  return match ? match.name : `${start}–${end}`;
}

/** Returns [startDate, endDate] as "YYYY-MM-DD" for the given period */
function getDateRange(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const day = now.getDay(); // 0=Sun

  const fmt = (dt) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

  switch (period) {
    // ── Added Case ──────────────────────────────────────
    case "all":
      return ["1970-01-01", "2099-12-31"];
    // ────────────────────────────────────────────────────
    case "today":
      return [fmt(now), fmt(now)];
    case "week": {
      const monday = new Date(y, m, d - ((day + 6) % 7));
      const sunday = new Date(y, m, d + (7 - day) % 7);
      return [fmt(monday), fmt(sunday)];
    }
    case "month":
      return [
        fmt(new Date(y, m, 1)),
        fmt(new Date(y, m + 1, 0)),
      ];
    case "year":
      return [
        fmt(new Date(y, 0, 1)),
        fmt(new Date(y, 11, 31)),
      ];
    default:
      return [fmt(now), fmt(now)];
  }
}

async function getAuthHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

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
// ── Confirm Dialog Component
// ══════════════════════════════════════════════

function ConfirmDialog({ open, message, onConfirm, onCancel, loading }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-90 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative glass-card p-6 w-full max-w-sm text-center animate-[scaleIn_0.2s_ease-out]">
        <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.27 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <p className="text-zinc-800 dark:text-zinc-200 font-medium mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all disabled:opacity-50"
          >
            {loading ? "Saving..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// ── Edit Modal Component
// ══════════════════════════════════════════════

function EditAttendanceModal({ open, record, onClose, onSave, saving }) {
  const [timeIn, setTimeIn] = useState("");
  const [timeOut, setTimeOut] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (open && record) {
      setTimeIn(record.timeIn || "");
      setTimeOut(record.timeOut || "");
      setShowConfirm(false);
    }
  }, [open, record]);

  if (!open || !record) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    onSave(record.id, timeIn, timeOut);
    setShowConfirm(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-80 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative glass-card p-8 w-full max-w-lg animate-[scaleIn_0.2s_ease-out]">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Edit Attendance
            </h3>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Read-only Info */}
          <div className="grid grid-cols-2 gap-4 mb-6 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700/50">
            <div>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Employee</span>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">{record.userName || "—"}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Date</span>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">{formatDateLabel(record.date)}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Scheduled Shift</span>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                {formatTime12(record.scheduleStart)} – {formatTime12(record.scheduleEnd)}
              </p>
            </div>
            <div>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Status</span>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">{record.status}</p>
            </div>
          </div>

          {/* Editable Fields */}
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Punch In
                </label>
                <input
                  type="time"
                  value={timeIn}
                  onChange={(e) => setTimeIn(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Punch Out
                </label>
                <input
                  type="time"
                  value={timeOut}
                  onChange={(e) => setTimeOut(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ConfirmDialog
        open={showConfirm}
        message="Are you sure you want to update this attendance record? All metrics will be recalculated."
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirm(false)}
        loading={saving}
      />
    </>
  );
}

// ══════════════════════════════════════════════
// ── KPI Card Component
// ══════════════════════════════════════════════

function KpiCard({ icon, label, value, unit, color, bgColor }) {
  return (
    <div
      className={`${bgColor} rounded-xl p-5 border border-zinc-100 dark:border-zinc-800 shadow-sm transition-transform hover:scale-[1.02] hover:shadow-md`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center`}>
          {icon}
        </div>
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        {value}
        {unit && <span className="text-sm font-normal text-zinc-400 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// ── View Modal Component
// ══════════════════════════════════════════════

function ViewAttendanceModal({ open, record, onClose }) {
  if (!open || !record) return null;

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card p-8 w-full max-w-lg animate-[scaleIn_0.2s_ease-out]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Attendance Details
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700/50">
          <div className="col-span-2 sm:col-span-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Employee</span>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">{record.userName || "—"}</p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Date</span>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">{formatDateLabel(record.date)}</p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Scheduled Shift</span>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
              {formatTime12(record.scheduleStart)} – {formatTime12(record.scheduleEnd)}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Punch In</span>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 font-mono">{formatTime12(record.timeIn)}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Punch Out</span>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 font-mono">{record.timeOut ? formatTime12(record.timeOut) : "—"}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Regular Hours</span>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">{record.regularHours?.toFixed(2) ?? "0.00"} h</p>
          </div>
          <div>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Overtime Hours</span>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">{record.overtimeHours?.toFixed(2) ?? "0.00"} h</p>
          </div>
          <div>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Late Minutes</span>
            <p className={`text-sm font-semibold mt-0.5 ${(record.lateMinutes || 0) > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100"}`}>
              {record.lateMinutes ?? 0} min
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Undertime Minutes</span>
            <p className={`text-sm font-semibold mt-0.5 ${(record.undertimeMinutes || 0) > 0 ? "text-rose-600 dark:text-rose-400" : "text-zinc-900 dark:text-zinc-100"}`}>
              {record.undertimeMinutes ?? 0} min
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Night Diff Hours</span>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">{record.nightDifferentialHours?.toFixed(2) ?? "0.00"} h</p>
          </div>
          <div>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Status</span>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">{record.status}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// ── Skeleton Loader
// ══════════════════════════════════════════════

function SkeletonLoader() {
  return (
    <>
      <table className="hidden xl:table w-full">
        <tbody className="xl:table-row-group">
          {Array.from({ length: 5 }).map((_, r) => (
            <tr key={r} className="animate-pulse border-b border-zinc-100 dark:border-zinc-800">
              {Array.from({ length: 13 }).map((_, i) => (
                <td key={i} className="px-3 py-4">
                  <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-full" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-4 p-4 animate-pulse">
        {Array.from({ length: 4 }).map((_, c) => (
          <div key={c} className="bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="h-5 bg-zinc-200 dark:bg-zinc-700 rounded w-2/3" />
            <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2" />
            <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4" />
          </div>
        ))}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════
// ── Main Page Component
// ══════════════════════════════════════════════

export default function AttendanceManagement() {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();

  // Data
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Period
  const [period, setPeriod] = useState("all");

  // Filters
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [shiftFilter, setShiftFilter] = useState("All");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sorting
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  // Modals
  const [editRecord, setEditRecord] = useState(null);
  const [viewRecord, setViewRecord] = useState(null);
  const [saving, setSaving] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);

  // ── Real-time Firestore listener ──
  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);

    const [startDate, endDate] = getDateRange(period);

    const q = query(
      collection(db, "dailySummary"),
      where("date", ">=", startDate),
      where("date", "<=", endDate),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRecords(data);
        setLoading(false);
      },
      (err) => {
        console.error("Error listening to attendance:", err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [currentUser, period]);

  // Reset page on filter changes
  useEffect(() => {
    setPage(1);
  }, [searchText, statusFilter, shiftFilter, filterStartDate, filterEndDate, period, pageSize]);

  // ── Filtered, Sorted, Paginated ──
  const filteredRecords = useMemo(() => {
    let result = [...records];

    // Search by name or userId
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter(
        (r) =>
          (r.userName || "").toLowerCase().includes(q) ||
          (r.userId || "").toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== "All") {
      result = result.filter((r) => r.status === statusFilter);
    }

    // Shift filter
    if (shiftFilter !== "All") {
      const [start, end] = shiftFilter.split("-");
      result = result.filter(
        (r) => r.scheduleStart === start && r.scheduleEnd === end
      );
    }

    // Date Range filter
    if (filterStartDate) {
      result = result.filter((r) => r.date >= filterStartDate);
    }
    if (filterEndDate) {
      result = result.filter((r) => r.date <= filterEndDate);
    }

    // Sort
    result.sort((a, b) => {
      let va = a[sortField];
      let vb = b[sortField];

      if (typeof va === "string") {
        va = va.toLowerCase();
        vb = (vb || "").toLowerCase();
      }
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [records, searchText, statusFilter, shiftFilter, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const paginatedRecords = filteredRecords.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  // ── KPI aggregation ──
  const kpis = useMemo(() => {
    const uniqueEmployees = new Set(records.map((r) => r.userId));
    return {
      present: uniqueEmployees.size,
      regularHours: records.reduce((s, r) => s + (r.regularHours || 0), 0),
      overtimeHours: records.reduce((s, r) => s + (r.overtimeHours || 0), 0),
      lateMinutes: records.reduce((s, r) => s + (r.lateMinutes || 0), 0),
      undertimeMinutes: records.reduce((s, r) => s + (r.undertimeMinutes || 0), 0),
      nightDiffHours: records.reduce((s, r) => s + (r.nightDifferentialHours || 0), 0),
    };
  }, [records]);

  // ── Sort handler ──
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  };

  // ── Edit save handler ──
  const handleSaveEdit = async (summaryId, timeIn, timeOut) => {
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      await axios.put(
        `/api/attendance/admin/edit/${summaryId}`,
        { timeIn, timeOut: timeOut || null },
        { headers }
      );
      setToast({ message: "Attendance updated and metrics recalculated.", type: "success" });
      setEditRecord(null);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Failed to update.";
      setToast({ message: msg, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  // ── Logout ──
  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch {
      setToast({ message: "Failed to log out", type: "error" });
    }
  };

  // ── Sort Header ──
  const SortHeader = ({ field, children, className = "" }) => (
    <th
      onClick={() => handleSort(field)}
      className={`px-3 py-3 font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap cursor-pointer select-none hover:text-red-500 transition-colors text-left ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortField === field && (
          <span className="text-red-500 text-xs">
            {sortDir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </span>
    </th>
  );

  // ── Period Tabs ──
  const periods = [
    { key: "all", label: "All" },
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "year", label: "This Year" },
  ];

  // ══════════════════════════════════════════════
  // ── Render
  // ══════════════════════════════════════════════

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <EditAttendanceModal
        open={!!editRecord}
        record={editRecord}
        onClose={() => setEditRecord(null)}
        onSave={handleSaveEdit}
        saving={saving}
      />
      <ViewAttendanceModal
        open={!!viewRecord}
        record={viewRecord}
        onClose={() => setViewRecord(null)}
      />

      <div className="w-full max-w-7xl mt-10">
        {/* ── Header ── */}
        <header className="flex items-center mb-8">
          <div>
            <button
              onClick={() => navigate("/admin/dashboard")}
              className="text-primary hover:text-primary-hover font-medium text-sm transition-colors mb-2 inline-flex items-center gap-1"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-linear-to-r from-red-500 to-orange-500">
              Attendance Management
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">
              Manage employee attendance
            </p>
          </div>
        </header>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <KpiCard
            label="Present"
            value={kpis.present}
            unit=""
            color="bg-emerald-100 dark:bg-emerald-900/30"
            bgColor="bg-white/70 dark:bg-surface-dark backdrop-blur-xl border border-zinc-200 dark:border-border-dark"
            icon={
              <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          />
          <KpiCard
            label="Regular"
            value={kpis.regularHours.toFixed(2)}
            unit="hrs"
            color="bg-blue-100 dark:bg-blue-900/30"
            bgColor="bg-white/70 dark:bg-surface-dark backdrop-blur-xl border border-zinc-200 dark:border-border-dark"
            icon={
              <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <KpiCard
            label="Overtime"
            value={kpis.overtimeHours.toFixed(2)}
            unit="hrs"
            color="bg-orange-100 dark:bg-orange-900/30"
            bgColor="bg-white/70 dark:bg-surface-dark backdrop-blur-xl border border-zinc-200 dark:border-border-dark"
            icon={
              <svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
          <KpiCard
            label="Late"
            value={kpis.lateMinutes}
            unit="min"
            color="bg-red-100 dark:bg-red-900/30"
            bgColor="bg-white/70 dark:bg-surface-dark backdrop-blur-xl border border-zinc-200 dark:border-border-dark"
            icon={
              <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <KpiCard
            label="Undertime"
            value={kpis.undertimeMinutes}
            unit="min"
            color="bg-rose-100 dark:bg-rose-900/30"
            bgColor="bg-white/70 dark:bg-surface-dark backdrop-blur-xl border border-zinc-200 dark:border-border-dark"
            icon={
              <svg className="w-4 h-4 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <KpiCard
            label="Night Diff"
            value={kpis.nightDiffHours.toFixed(2)}
            unit="hrs"
            color="bg-indigo-100 dark:bg-indigo-900/30"
            bgColor="bg-white/70 dark:bg-surface-dark backdrop-blur-xl border border-zinc-200 dark:border-border-dark"
            icon={
              <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            }
          />
        </div>

        {/* ── Filters & Search ── */}
        <div className="glass-card p-4 md:p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">

            {/* Search - Full width on mobile, expands automatically on desktop */}
            <div className="relative flex-1 min-w-0">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by Employee ID or Name..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="input-field pl-10! w-full"
              />
            </div>

            {/* Filter Group Container: Grid on mobile/tablet, flex layout on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row items-center gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Period:</label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="input-field text-sm py-2! px-3! w-full lg:w-auto!"
                >
                  {periods.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Status Filter */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Status:</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input-field text-sm py-2! px-3! w-full lg:w-auto!"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Shift Filter */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Shift:</label>
                <select
                  value={shiftFilter}
                  onChange={(e) => setShiftFilter(e.target.value)}
                  className="input-field text-sm py-2! px-3! w-full lg:w-auto!"
                >
                  <option value="All">All Shifts</option>
                  {SHIFTS.map((s) => (
                    <option key={s.start} value={`${s.start}-${s.end}`}>{s.name} ({s.label})</option>
                  ))}
                </select>
              </div>

            </div>
          </div>
        </div>

        {/* ── Attendance Table ── */}
        <div className="glass-card overflow-hidden mb-10">
          {loading ? (
            <SkeletonLoader />
          ) : paginatedRecords.length === 0 ? (
            <div className="p-16 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-zinc-500 dark:text-zinc-400 font-medium">
                  No attendance records found for this period.
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Try adjusting the reporting period or clearing your filters.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Desktop View ── Table */}
              <div className="hidden xl:block overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700/50 bg-zinc-50/80 dark:bg-zinc-900/50">
                      <SortHeader field="date">Date</SortHeader>
                      <SortHeader field="userName">Employee Name</SortHeader>
                      <th className="px-3 py-3 font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap text-left">Shift</th>
                      <SortHeader field="timeIn">Punch In</SortHeader>
                      <SortHeader field="timeOut">Punch Out</SortHeader>
                      <SortHeader field="regularHours">Regular</SortHeader>
                      <SortHeader field="overtimeHours">OT</SortHeader>
                      <SortHeader field="lateMinutes">Late</SortHeader>
                      <SortHeader field="undertimeMinutes">Undertime</SortHeader>
                      <SortHeader field="nightDifferentialHours">ND</SortHeader>
                      <SortHeader field="status">Status</SortHeader>
                      <th className="px-3 py-3 font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {paginatedRecords.map((record) => (
                      <tr
                        key={record.id}
                        className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                      >
                        <td className="px-3 py-3 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          {formatDateLabel(record.date)}
                        </td>
                        <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300 whitespace-nowrap font-medium">
                          {record.userName || "—"}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {getShiftLabel(record.scheduleStart, record.scheduleEnd)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap font-mono text-xs">
                          {formatTime12(record.timeIn)}
                        </td>
                        <td className="px-3 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap font-mono text-xs">
                          {record.timeOut ? formatTime12(record.timeOut) : "—"}
                        </td>
                        <td className="px-3 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          {record.regularHours?.toFixed(2) ?? "0.00"} h
                        </td>
                        <td className="px-3 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          {record.overtimeHours?.toFixed(2) ?? "0.00"} h
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-xs font-medium ${(record.lateMinutes || 0) > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                            {record.lateMinutes ?? 0} min
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-xs font-medium ${(record.undertimeMinutes || 0) > 0 ? "text-rose-600 dark:text-rose-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                            {record.undertimeMinutes ?? 0} min
                          </span>
                        </td>
                        <td className="px-3 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          {record.nightDifferentialHours?.toFixed(2) ?? "0.00"} h
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${record.status === "Completed"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                              : record.status === "In Progress"
                                ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${record.status === "Completed"
                                ? "bg-emerald-500"
                                : record.status === "In Progress"
                                  ? "bg-amber-500 animate-pulse"
                                  : "bg-zinc-400"
                                }`}
                            />
                            {record.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <button
                            onClick={() => setEditRecord(record)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-white bg-red-50 hover:bg-red-500 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white border border-red-200 dark:border-red-800/30 rounded-lg transition-all"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tablet/Mobile Device View ── Cards Grid */}
              <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-zinc-50/30 dark:bg-zinc-900/10">
                {paginatedRecords.map((record) => (
                  <div
                    key={record.id}
                    className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-xs flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200"
                  >
                    <div>
                      {/* Card Header Row */}
                      <div className="flex justify-between items-start mb-3 gap-2">
                        <div>
                          <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">{record.userName || "—"}</h3>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">{formatDateLabel(record.date)}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${record.status === "Completed"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                          : record.status === "In Progress"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${record.status === "Completed"
                            ? "bg-emerald-500"
                            : record.status === "In Progress"
                              ? "bg-amber-500 animate-pulse"
                              : "bg-zinc-400"
                            }`} />
                          {record.status}
                        </span>
                      </div>

                      {/* Card Technical Badges */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {getShiftLabel(record.scheduleStart, record.scheduleEnd)}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${(record.lateMinutes || 0) > 0 ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300" : "bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}>
                          Late: {record.lateMinutes ?? 0}m
                        </span>
                      </div>

                      {/* Info Metadata Block */}
                      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs border-t border-zinc-100 dark:border-zinc-800/80 pt-3 mb-4 text-zinc-600 dark:text-zinc-400">
                        <div>
                          <span className="block text-zinc-400 font-medium mb-0.5">Punch In:</span>
                          <span className="font-mono">{formatTime12(record.timeIn)}</span>
                        </div>
                        <div>
                          <span className="block text-zinc-400 font-medium mb-0.5">Punch Out:</span>
                          <span className="font-mono">{record.timeOut ? formatTime12(record.timeOut) : "—"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Block */}
                    <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/50 flex flex-col sm:flex-row gap-2 justify-end">
                      <button
                        onClick={() => setViewRecord(record)}
                        className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        View Details
                      </button>
                      <button
                        onClick={() => setEditRecord(record)}
                        className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 rounded-xl transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit Record
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Pagination Footer */}
          {!loading && filteredRecords.length > 0 && (
            <div className="px-4 md:px-6 py-3 border-t border-zinc-200 dark:border-zinc-700/50 bg-zinc-50/50 dark:bg-zinc-900/30 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Showing {(page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, filteredRecords.length)} of{" "}
                {filteredRecords.length} record{filteredRecords.length !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="px-2.5 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ««
                </button>
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
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="px-2.5 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  »»
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
