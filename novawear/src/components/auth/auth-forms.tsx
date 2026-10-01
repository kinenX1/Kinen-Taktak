"use client";

import Link from "next/link";
import { useActionState, useState, type ComponentProps } from "react";
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from "@/actions/auth";
import { initialFormState } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { Eye, EyeOff } from "@/components/ui/icons";

function PasswordInput(props: ComponentProps<"input">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className="pr-12" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-1.5 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message && <FormMessage>{state.message}</FormMessage>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field id="email" label="Email" error={e.email}>
        {(a) => <Input {...a} name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} autoFocus />}
      </Field>
      <Field id="password" label="Password" error={e.password}>
        {(a) => <PasswordInput {...a} name="password" autoComplete="current-password" required />}
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-semibold underline-offset-4 hover:underline">
          Forgot your password?
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" pending={pending} arrow>
        {pending ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(registerAction, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message && <FormMessage>{state.message}</FormMessage>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field id="name" label="Full name" error={e.name}>
        {(a) => <Input {...a} name="name" autoComplete="name" required defaultValue={state.values?.name} autoFocus />}
      </Field>
      <Field id="email" label="Email" error={e.email}>
        {(a) => <Input {...a} name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} />}
      </Field>
      <Field id="phone" label="Phone" error={e.phone} optional hint="So we can confirm your orders faster.">
        {(a) => <Input {...a} name="phone" type="tel" autoComplete="tel" defaultValue={state.values?.phone} />}
      </Field>
      <Field id="password" label="Password" error={e.password} hint="At least 10 characters.">
        {(a) => <PasswordInput {...a} name="password" autoComplete="new-password" required minLength={10} maxLength={128} />}
      </Field>
      <Button type="submit" size="lg" className="w-full" pending={pending} arrow>
        {pending ? "Creating account" : "Create my account"}
      </Button>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initialFormState);
  if (state.ok) return <FormMessage tone="success">{state.message}</FormMessage>;
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message && <FormMessage>{state.message}</FormMessage>}
      <Field id="email" label="Email" error={state.fieldErrors?.email}>
        {(a) => <Input {...a} name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} autoFocus />}
      </Field>
      <Button type="submit" size="lg" className="w-full" pending={pending} arrow>
        {pending ? "Sending" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initialFormState);
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message && (
        <FormMessage>
          {state.message}{" "}
          <Link href="/forgot-password" className="underline underline-offset-2">
            Request a new link
          </Link>
        </FormMessage>
      )}
      <input type="hidden" name="token" value={token} />
      <Field id="password" label="New password" hint="At least 10 characters." error={state.fieldErrors?.password}>
        {(a) => <PasswordInput {...a} name="password" autoComplete="new-password" required minLength={10} maxLength={128} autoFocus />}
      </Field>
      <Button type="submit" size="lg" className="w-full" pending={pending} arrow>
        {pending ? "Saving" : "Set new password"}
      </Button>
    </form>
  );
}

export function AuthHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8">
      <p className="eyebrow mb-3">{eyebrow}</p>
      <h1 className="display text-[clamp(3.25rem,6vw,5.25rem)]">{title}</h1>
      {children && <p className="mt-3 text-base leading-relaxed text-body">{children}</p>}
    </div>
  );
}
