import LoginForm from './login-form';

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-headline-small">Perfect Profile Prospecting</h1>
      <div className="card flex flex-col gap-4 p-6">
        <LoginForm />
      </div>
    </main>
  );
}
