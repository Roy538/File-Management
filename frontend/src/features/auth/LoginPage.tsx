import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate, useLocation } from 'react-router';
import { FolderOpen, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useSession } from './session';
import { Field, Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ApiError } from '@/lib/api/client';

const schema = z.object({
  organisation: z.string().trim().min(1, 'Enter your organisation code').max(32),
  email: z.string().trim().email('Enter the email address you sign in with'),
  password: z.string().min(1, 'Enter your password'),
});
type Values = z.infer<typeof schema>;

const REMEMBER_KEY = 'med.organisation';

function rememberedOrganisation(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function LoginPage() {
  const status = useSession((s) => s.status);
  const notice = useSession((s) => s.notice);
  const signIn = useSession((s) => s.signIn);
  const location = useLocation();
  const [failure, setFailure] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { organisation: rememberedOrganisation(), email: '', password: '' },
  });

  if (status === 'signedIn') {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (v: Values) => {
    setFailure(null);
    try {
      await signIn(v.organisation.toUpperCase(), v.email, v.password);
      try { localStorage.setItem(REMEMBER_KEY, v.organisation.toUpperCase()); } catch { /* convenience only */ }
    } catch (e) {
      setFailure(e instanceof ApiError && e.status === 401
        ? 'That organisation, email and password don’t match an active account. After 5 failed attempts the account is locked for 15 minutes.'
        : e instanceof ApiError ? e.message : 'The server could not be reached. Check your connection and try again.');
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,520px)]">
      <section className="relative hidden overflow-hidden bg-navy-800 p-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-manila-300"><FolderOpen className="size-5 text-navy-800" strokeWidth={2.25} /></span>
          <span className="text-lg font-semibold tracking-tight">ManageEDocs</span>
        </div>
        <div className="mt-auto max-w-lg">
          <p className="doc-title text-[40px] leading-[1.1]">Every record filed, found and accounted for.</p>
          <p className="mt-4 max-w-md text-[15px] text-white/75">
            Cabinets, folders and sub-dividers for your organisation’s documents, with version history, reviews,
            retention and a tamper-evident audit trail.
          </p>
        </div>
        {/* The filing motif, drawn rather than photographed: a stack of folder tabs. */}
        <div aria-hidden className="pointer-events-none absolute -right-10 top-24 flex flex-col gap-3 opacity-90">
          {['Board minutes', 'HR employee files', 'Customer loans', 'Company policies'].map((t, i) => (
            <div key={t} style={{ marginLeft: i * 28 }} className="w-80">
              <span className="file-tab">{t}</span>
              <div className="h-10 rounded-b-md rounded-tr-md bg-white/8 border border-white/10" />
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center bg-surface px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-9 place-items-center rounded-lg bg-navy-800"><FolderOpen className="size-5 text-manila-300" /></span>
            <span className="text-lg font-semibold">ManageEDocs</span>
          </div>
          <h1 className="doc-title text-[28px] text-ink">Sign in</h1>
          <p className="mt-1 text-[13.5px] text-muted">Use the organisation code your administrator gave you.</p>

          {notice ? <p role="status" className="mt-5 rounded-md border border-info/25 bg-info-bg px-3 py-2 text-[13px] text-info">{notice}</p> : null}
          {failure ? <p role="alert" className="mt-5 rounded-md border border-danger/25 bg-danger-bg px-3 py-2 text-[13px] text-danger">{failure}</p> : null}

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Field label="Organisation code" error={errors.organisation?.message}>
              {(a) => <Input {...a} {...register('organisation')} autoComplete="organization" className="uppercase" autoFocus />}
            </Field>
            <Field label="Email" error={errors.email?.message}>
              {(a) => <Input {...a} {...register('email')} type="email" autoComplete="username" />}
            </Field>
            <Field label="Password" error={errors.password?.message}>
              {(a) => <Input {...a} {...register('password')} type="password" autoComplete="current-password" />}
            </Field>
            <Button type="submit" variant="primary" loading={isSubmitting} className="mt-1 h-10">Sign in</Button>
          </form>

          <p className="mt-8 flex items-start gap-2 text-[12.5px] text-muted">
            <ShieldCheck className="mt-px size-4 shrink-0 text-ok" aria-hidden />
            Your session is kept in a secure cookie this site can’t read from scripts, and ends when you sign out.
          </p>
        </div>
      </section>
    </div>
  );
}
