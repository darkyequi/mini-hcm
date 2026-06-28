import axios from "axios";
import { auth } from "../firebase";

const API_BASE = "/api/attendance";

/**
 * Gets the Firebase Auth ID token for the current user
 * and returns it as an Authorization header object.
 */
async function getAuthHeaders() {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
}

/**
 * Punch In — creates an attendance record and initializes the daily summary.
 * @returns {Object} { summary, message }
 */
export async function punchIn() {
    const headers = await getAuthHeaders();
    const { data } = await axios.post(`${API_BASE}/punch-in`, {}, { headers });
    return data;
}

/**
 * Punch Out — records the punch-out, computes metrics on the backend,
 * and returns the completed daily summary.
 * @returns {Object} { summary, message }
 */
export async function punchOut() {
    const headers = await getAuthHeaders();
    const { data } = await axios.post(`${API_BASE}/punch-out`, {}, { headers });
    return data;
}

/**
 * Get Today's Summary — returns the current daily summary and schedule info.
 * @returns {Object} { summary, schedule }
 */
export async function getTodaySummary() {
    const headers = await getAuthHeaders();
    const { data } = await axios.get(`${API_BASE}/today`, { headers });
    return data;
}
