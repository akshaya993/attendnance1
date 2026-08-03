// Server component: a static shell around the interactive <LoginForm />.
// Only the form ships JavaScript to the browser.

import LoginForm from "@/components/auth/LoginForm";

export const metadata = {
  title: "Sign in | Greenwood School",
};

export default function LoginPage() {
  return (
    <main className="bg-page flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <p className="label-micro text-muted">GREENWOOD / PORTAL</p>
          <h1 className="mt-3 text-3xl">Sign in</h1>
          <p className="text-muted mt-3 text-sm">
            Use the phone number registered with the school.
          </p>
        </header>

        <div className="card p-6">
          <LoginForm />
        </div>

        <p className="label-micro text-muted mt-8 text-center">
          TROUBLE SIGNING IN? CONTACT THE SCHOOL OFFICE
        </p>
      </div>
    </main>
  );
}