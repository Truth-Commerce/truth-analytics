import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-base px-4">
      {children}
    </main>
  );
}
