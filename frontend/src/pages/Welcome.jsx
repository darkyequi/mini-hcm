import React from "react";
import { Link } from "react-router-dom";

export default function Welcome() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-3xl w-full text-center relative z-10">
        
        <div className="glass-card p-10 md:p-16 mb-8 overflow-hidden relative">
          {/* Decorative background blur inside card */}
          <div className="absolute -top-32 -left-32 w-64 h-64 bg-primary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
          <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-purple-400/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>

          <div className="relative z-10">
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 text-transparent bg-clip-text bg-linear-to-r from-primary via-purple-500 to-pink-500">
              Welcome to Mini HCM
            </h1>
            <p className="text-lg md:text-xl text-zinc-600 dark:text-zinc-300 mb-10 max-w-2xl mx-auto">
              Your comprehensive Human Capital Management solution. Streamline your workforce, manage roles securely, and empower your organization with our modern platform.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link 
                to="/login" 
                className="w-full sm:w-auto px-8 py-3.5 border border-transparent rounded-xl shadow-md text-base font-medium text-white bg-primary hover:bg-primary-hover transition-all duration-200 transform hover:-translate-y-0.5"
              >
                Sign In to Account
              </Link>
              <Link 
                to="/register" 
                className="w-full sm:w-auto px-8 py-3.5 border border-zinc-300 dark:border-zinc-700 rounded-xl shadow-sm text-base font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all duration-200"
              >
                Create New Account
              </Link>
            </div>
          </div>
        </div>
        
        <p className="text-zinc-500 dark:text-zinc-500 text-sm">
          &copy; {new Date().getFullYear()} Mini HCM Project. All rights reserved.
        </p>

      </div>
    </div>
  );
}
