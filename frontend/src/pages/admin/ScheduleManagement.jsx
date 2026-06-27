import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { auth, db } from "../../firebase";
import { signOut } from "firebase/auth";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";

// ── Shift Definitions ──
const SHIFTS = [
  { name: "Morning", label: "6:00 AM – 2:00 PM", start: "06:00", end: "14:00" },
  { name: "Afternoon", label: "2:00 PM – 10:00 PM", start: "14:00", end: "22:00" },
  { name: "Night", label: "10:00 PM – 6:00 AM", start: "22:00", end: "06:00" },
];

const FILTER_OPTIONS = [
  { value: "all", label: "All Schedules" },
  { value: "06:00-14:00", label: "6:00 AM – 2:00 PM" },
  { value: "14:00-22:00", label: "2:00 PM – 10:00 PM" },
  { value: "22:00-06:00", label: "10:00 PM – 6:00 AM" },
];

// ── Helpers ──
function getStatusFromEndDate(endDate) {
  if (!endDate) return "Expired";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate + "T23:59:59");
  return end >= today ? "Active" : "Expired";
}

function formatTime(time24) {
  const [h, m] = time24.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${suffix}`;
}

function hasOverlap(schedules, userId, startDate, endDate, excludeId = null) {
  return schedules.some((s) => {
    if (s.userId !== userId) return false;
    if (excludeId && s.id === excludeId) return false;
    return s.startDate <= endDate && s.endDate >= startDate;
  });
}

// ── Toast Component ──
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

// ── Confirmation Dialog ──
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
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-xl transition-all disabled:opacity-50"
          >
            {loading ? "Saving..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Schedule Modal (Create / Edit) ──
function ScheduleModal({
  open,
  onClose,
  users,
  schedules,
  editingSchedule,
  onSuccess,
}) {
  const isEdit = !!editingSchedule;

  const [showUsers, setShowUsers] = useState(false);

  const [formData, setFormData] = useState({
    userId: [],
    schedule: "",
    startDate: "",
    endDate: "",
  });

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      if (isEdit && editingSchedule) {
        const shiftKey = `${editingSchedule.shiftStart}-${editingSchedule.shiftEnd}`;
        setFormData({
          userId: editingSchedule.userId,
          schedule: shiftKey,
          startDate: editingSchedule.startDate,
          endDate: editingSchedule.endDate,
        });
      } else {
        setFormData({ userId: "", schedule: "", startDate: "", endDate: "" });
      }
      setFormError("");
    }
  }, [open, isEdit, editingSchedule]);

  const selectedUser = users.find((u) => u.id === formData.userId);
  const selectedShift = SHIFTS.find(
    (s) => `${s.start}-${s.end}` === formData.schedule
  );

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setFormError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!formData.userId || !formData.schedule || !formData.startDate || !formData.endDate) {
      setFormError("Please fill in all fields.");
      return;
    }

    if (formData.startDate > formData.endDate) {
      setFormError("End Date must be on or after Start Date.");
      return;
    }

    // Overlap check
    const overlap = hasOverlap(
      schedules,
      formData.userId,
      formData.startDate,
      formData.endDate,
      isEdit ? editingSchedule.id : null
    );

    if (overlap) {
      setFormError(
        "This user already has a schedule during the selected date range. If you want to change it, please edit the existing schedule."
      );
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await updateDoc(doc(db, "schedules", editingSchedule.id), {
          shiftName: selectedShift.name,
          shiftStart: selectedShift.start,
          shiftEnd: selectedShift.end,
          startDate: formData.startDate,
          endDate: formData.endDate,
          status: getStatusFromEndDate(formData.endDate),
          updatedAt: serverTimestamp(),
        });
        onSuccess("Schedule updated successfully!", "success");
      } else {
        const user = selectedUser;
        await addDoc(collection(db, "schedules"), {
          userId: user.id,
          userName: `${user.firstName} ${user.lastName}`,
          email: user.email,
          timezone: user.timeZone || "Not set",
          shiftName: selectedShift.name,
          shiftStart: selectedShift.start,
          shiftEnd: selectedShift.end,
          startDate: formData.startDate,
          endDate: formData.endDate,
          status: getStatusFromEndDate(formData.endDate),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        onSuccess("Schedule created successfully!", "success");
      }
      onClose();
    } catch (err) {
      console.error("Error saving schedule:", err);
      setFormError("Failed to save schedule. Please try again.");
    }
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card p-8 w-full max-w-lg animate-[scaleIn_0.2s_ease-out]">
        <h2 className="text-xl font-bold mb-6 text-zinc-800 dark:text-zinc-100">
          {isEdit ? "Edit Schedule" : "Create Schedule"}
        </h2>

        {formError && (
          <div className="mb-4 p-3 rounded-lg bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Employee */}
          <div className="relative">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Employees
            </label>

            <button
              type="button"
              disabled={isEdit}
              onClick={() => setShowUsers(!showUsers)}
              className="input-field w-full text-left flex justify-between items-center"
            >
              <span>
                {formData.userId.length > 0
                  ? `${formData.userId.length} employee(s) selected`
                  : `Select Employees (${users.length})`}
              </span>

              <span>▼</span>
            </button>

            {showUsers && (
              <div className="absolute z-50 mt-2 w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {users.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={formData.userId.includes(u.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData((prev) => ({
                            ...prev,
                            userId: [...prev.userId, u.id],
                          }));
                        } else {
                          setFormData((prev) => ({
                            ...prev,
                            userId: prev.userId.filter((id) => id !== u.id),
                          }));
                        }
                      }}
                    />

                    <span>
                      {u.firstName} {u.lastName}
                      <span className="text-zinc-500"> ({u.email})</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Schedule Shift */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Schedule
            </label>
            <select
              name="schedule"
              value={formData.schedule}
              onChange={handleChange}
              className="input-field"
              required
            >
              <option value="">Select a shift</option>
              {SHIFTS.map((s) => (
                <option key={`${s.start}-${s.end}`} value={`${s.start}-${s.end}`}>
                  {s.name} ({s.label})
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Start Date
              </label>
              <input
                type="date"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                End Date
              </label>
              <input
                type="date"
                name="endDate"
                value={formData.endDate}
                onChange={handleChange}
                className="input-field"
                required
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-3 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving
                ? isEdit
                  ? "Updating..."
                  : "Creating..."
                : isEdit
                  ? "Update Schedule"
                  : "Create Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Loading Skeleton Row ──
function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 10 }).map((_, i) => (
        <td key={i} className="px-4 py-4">
          <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

// ══════════════════════════════════════════════
// ── Main Page Component ──
// ══════════════════════════════════════════════
export default function ScheduleManagement() {
  const { userData } = useAuth();
  const navigate = useNavigate();

  // Data
  const [schedules, setSchedules] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [searchTerm, setSearchTerm] = useState("");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [toast, setToast] = useState(null);

  // Confirmation for edit
  const [pendingEdit, setPendingEdit] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ── Fetch users (one-time) ──
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setUsers(list);
      } catch (err) {
        console.error("Error fetching users:", err);
        setToast({ message: "Failed to fetch users: " + err.message, type: "error" });
      }
    };
    fetchUsers();
  }, []);

  // ── Real-time schedules listener ──
  useEffect(() => {
    const q = query(collection(db, "schedules"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          // Recompute status on the client for accuracy
          status: getStatusFromEndDate(d.data().endDate),
        }));
        setSchedules(list);
        setLoading(false);
      },
      (err) => {
        console.error("Error listening to schedules:", err);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  // ── Filtered & searched schedules ──
  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      // Shift filter
      if (shiftFilter !== "all") {
        const key = `${s.shiftStart}-${s.shiftEnd}`;
        if (key !== shiftFilter) return false;
      }
      // Search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const name = (s.userName || "").toLowerCase();
        const email = (s.email || "").toLowerCase();
        if (!name.includes(term) && !email.includes(term)) return false;
      }
      return true;
    });
  }, [schedules, shiftFilter, searchTerm]);

  // ── Handlers ──
  const showToast = (message, type = "success") => setToast({ message, type });

  const handleEdit = (schedule) => {
    setEditingSchedule(schedule);
    setPendingEdit(schedule);
  };

  const handleConfirmEdit = () => {
    setPendingEdit(null);
    setShowEditModal(true);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (err) {
      showToast("Failed to log out", "error");
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">
      {/* Toast */}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Confirm Dialog for Edit */}
      <ConfirmDialog
        open={!!pendingEdit}
        message="Are you sure you want to edit this schedule?"
        loading={confirmLoading}
        onCancel={() => {
          setPendingEdit(null);
          setEditingSchedule(null);
        }}
        onConfirm={handleConfirmEdit}
      />

      {/* Create Modal */}
      <ScheduleModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        users={users}
        schedules={schedules}
        editingSchedule={null}
        onSuccess={showToast}
      />

      {/* Edit Modal */}
      <ScheduleModal
        open={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingSchedule(null);
        }}
        users={users}
        schedules={schedules}
        editingSchedule={editingSchedule}
        onSuccess={showToast}
      />

      <div className="w-full max-w-7xl mt-10">
        {/* ── Header ── */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <button
              onClick={() => navigate("/admin/dashboard")}
              className="text-primary hover:text-primary-hover font-medium text-sm transition-colors mb-2 inline-flex items-center gap-1"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-linear-to-r from-red-500 to-orange-500">
              Schedule Management
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">
              Manage employee work schedules and shift assignments
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-5 py-2.5 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors shadow-sm"
          >
            Log Out
          </button>
        </header>

        {/* ── Toolbar ── */}
        <div className="glass-card p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            {/* Create Button */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Schedule
            </button>

            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10!"
              />
            </div>

            {/* Shift Filter */}
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="input-field w-auto! shrink-0"
            >
              {FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700/50 bg-zinc-50/80 dark:bg-zinc-900/50">
                  <th className="px-4 py-3.5 font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Employee Name</th>
                  <th className="px-4 py-3.5 font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Email</th>
                  <th className="px-4 py-3.5 font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Timezone</th>
                  <th className="px-4 py-3.5 font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Schedule</th>
                  <th className="px-4 py-3.5 font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Shift Start</th>
                  <th className="px-4 py-3.5 font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Shift End</th>
                  <th className="px-4 py-3.5 font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Start Date</th>
                  <th className="px-4 py-3.5 font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap">End Date</th>
                  <th className="px-4 py-3.5 font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3.5 font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {loading ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : filteredSchedules.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                          <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p className="text-zinc-500 dark:text-zinc-400 font-medium">
                          {searchTerm || shiftFilter !== "all"
                            ? "No schedules match your search or filter."
                            : "No schedules have been created yet."}
                        </p>
                        {!searchTerm && shiftFilter === "all" && (
                          <button
                            onClick={() => setShowCreateModal(true)}
                            className="text-primary hover:text-primary-hover font-medium text-sm transition-colors"
                          >
                            Create your first schedule →
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredSchedules.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-4 py-3.5 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                        {s.userName}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {s.email}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-100 dark:border-blue-800/30">
                          {s.timezone}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.shiftName === "Morning"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                            : s.shiftName === "Afternoon"
                              ? "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300"
                              : "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300"
                          }`}>
                          {s.shiftName}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap font-mono text-xs">
                        {formatTime(s.shiftStart)}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap font-mono text-xs">
                        {formatTime(s.shiftEnd)}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {s.startDate}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {s.endDate}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.status === "Active"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${s.status === "Active" ? "bg-emerald-500" : "bg-zinc-400"
                              }`}
                          />
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <button
                          onClick={() => handleEdit(s)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:text-primary-hover bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table footer with count */}
          {!loading && filteredSchedules.length > 0 && (
            <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-700/50 bg-zinc-50/50 dark:bg-zinc-900/30 text-xs text-zinc-500 dark:text-zinc-400">
              Showing {filteredSchedules.length} of {schedules.length} schedule{schedules.length !== 1 ? "s" : ""}
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
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
