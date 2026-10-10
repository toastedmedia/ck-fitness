"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  logIn,
  requestPasswordReset,
  signUp,
  updatePassword,
  type FormState,
} from "@/app/auth/actions";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Action = (prev: FormState, data: FormData) => Promise<FormState>;
const initial: FormState = {};

function Feedback({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-2xl bg-surface p-3 font-semibold text-danger">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p
        role="status"
        className="rounded-2xl bg-success-soft p-3 font-semibold text-success"
      >
        {state.message}
      </p>
    );
  return null;
}

function useForm(action: Action) {
  return useActionState(action, initial);
}

export function SignupForm() {
  const [state, formAction] = useForm(signUp);
  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        hint="At least 8 characters."
        required
      />
      <label className="flex min-h-12 items-start gap-3">
        <input type="checkbox" name="adult" className="mt-1 size-5 accent-brand" />
        <span>I am 18 or older and agree to the Terms and Privacy Policy.</span>
      </label>
      <Feedback state={state} />
      <SubmitButton>Create account</SubmitButton>
      <p className="text-center text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

export function LoginForm() {
  const [state, formAction] = useForm(logIn);
  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <Feedback state={state} />
      <SubmitButton>Log in</SubmitButton>
      <p className="text-center">
        <Link href="/forgot-password" className="font-semibold text-brand underline">
          Forgot password?
        </Link>
      </p>
    </form>
  );
}

export function ForgotForm() {
  const [state, formAction] = useForm(requestPasswordReset);
  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Feedback state={state} />
      <SubmitButton>Send reset link</SubmitButton>
    </form>
  );
}

export function ResetForm() {
  const [state, formAction] = useForm(updatePassword);
  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        hint="At least 8 characters."
        required
      />
      <Feedback state={state} />
      <SubmitButton>Save new password</SubmitButton>
    </form>
  );
}
