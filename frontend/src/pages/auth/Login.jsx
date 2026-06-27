import React, { useState } from "react";
import { auth } from "../../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      // Fetch user role to determine routing
      const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));

      if (userDoc.exists()) {
        const role = userDoc.data().role;
        if (role === "admin") {
          navigate("/admin/dashboard");
        } else {
          navigate("/user/dashboard");
        }
      } else {
        // Fallback if no doc exists
        navigate("/user/dashboard");
      }

    } catch (err) {
      setError("Failed to sign in: " + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block mb-4 text-primary hover:text-primary-hover font-medium text-sm transition-colors">
            &larr; Back to Welcome
          </Link>
          <h1 className="text-4xl font-bold tracking-tight mb-2 text-transparent bg-clip-text bg-linear-to-r from-primary to-purple-400">
            Welcome Back
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Sign in to access your account
          </p>
        </div>

        <div className="glass-card p-8">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-100 border border-red-200 text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                className="input-field"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary mt-6">
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
            Don't have an account?{" "}
            <Link to="/register" className="font-medium text-primary hover:text-primary-hover transition-colors">
              Register here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
