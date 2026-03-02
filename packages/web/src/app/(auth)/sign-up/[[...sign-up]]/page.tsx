import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">LeadFlow Engine</h1>
          <p className="mt-2 text-slate-400">Create your account — it's free to start</p>
        </div>
        <SignUp
          appearance={{
            elements: {
              formButtonPrimary: 'bg-amber-500 hover:bg-amber-600 text-sm normal-case',
              card: 'shadow-2xl',
            },
          }}
        />
      </div>
    </div>
  );
}
