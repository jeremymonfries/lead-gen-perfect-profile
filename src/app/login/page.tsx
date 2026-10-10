import LoginForm from './login-form';

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Perfect Profile Prospecting</h1>
      <LoginForm />
    </main>
  );
}
