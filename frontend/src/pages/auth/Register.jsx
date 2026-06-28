import React, { useState } from "react";
import { auth, db } from "../../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";

export default function Register() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    passwordConfirm: "",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    role: "user", // Default
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.passwordConfirm) {
      return setError("Passwords do not match");
    }

    setError("");
    setLoading(true);

    try {
      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      // 2. Create user document in Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        timeZone: formData.timeZone,
        role: formData.role,
        createdAt: serverTimestamp()
      });

      // 3. Redirect based on role
      if (formData.role === "admin") {
        navigate("/admin/dashboard");
      } else {
        navigate("/user/dashboard");
      }

    } catch (err) {
      setError("Failed to create an account: " + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 my-8">
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block mb-4 text-primary hover:text-primary-hover font-medium text-sm transition-colors">
            &larr; Back to Welcome
          </Link>
          <h1 className="text-4xl font-bold tracking-tight mb-2 text-transparent bg-clip-text bg-linear-to-r from-primary to-purple-400">
            Create Account
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Join the Mini HCM platform
          </p>
        </div>

        <div className="glass-card p-8">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-100 border border-red-200 text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  First Name
                </label>
                <input
                  name="firstName"
                  type="text"
                  required
                  className="input-field"
                  value={formData.firstName}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Last Name
                </label>
                <input
                  name="lastName"
                  type="text"
                  required
                  className="input-field"
                  value={formData.lastName}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Email Address
              </label>
              <input
                name="email"
                type="email"
                required
                className="input-field"
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Time Zone
              </label>
              <input
                name="timeZone"
                type="text"
                required
                className="input-field"
                value={formData.timeZone}
                onChange={handleChange}
              />
            </div>

            {/* <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Role (For Demo)
              </label>
              <select
                name="role"
                className="input-field cursor-pointer"
                value={formData.role}
                onChange={handleChange}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div> */}

            <div className="pt-2">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Password
              </label>
              <input
                name="password"
                type="password"
                required
                className="input-field"
                value={formData.password}
                onChange={handleChange}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Confirm Password
              </label>
              <input
                name="passwordConfirm"
                type="password"
                required
                className="input-field"
                value={formData.passwordConfirm}
                onChange={handleChange}
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary mt-6">
              {loading ? "Creating Account..." : "Sign Up"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-primary hover:text-primary-hover transition-colors">
              Log in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
