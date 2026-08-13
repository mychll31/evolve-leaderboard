"use client";

import { useState } from "react";
import {
  Banner,
  Button,
  Field,
  inputClass,
  useAction,
} from "@/components/admin/controls";
import {
  changeOwnPasswordAction,
  updateOwnNameAction,
} from "@/app/actions/account";

export function NameForm({ name }: { name: string }) {
  const { pending, error, success, act } = useAction();
  const [draft, setDraft] = useState(name);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        act(() => updateOwnNameAction(draft), {
          successMessage: "Name updated",
        });
      }}
    >
      {error && <Banner tone="error">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      <Field
        label="Display name"
        hint="This is the name on the leaderboard and your team roster."
      >
        <input
          className={inputClass}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={pending}
          required
        />
      </Field>

      <div>
        <Button type="submit" disabled={pending || draft.trim() === name}>
          {pending ? "Saving…" : "Save name"}
        </Button>
      </div>
    </form>
  );
}

/**
 * One form for two situations. Someone who has only ever used Google has no
 * password to re-enter, and asking for one they do not have would be a dead
 * end — they are already signed in, which is proof enough.
 */
export function PasswordForm({
  hasPassword,
  minLength,
}: {
  hasPassword: boolean;
  minLength: number;
}) {
  const { pending, error, success, act, setError } = useAction();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    if (next !== confirm) {
      setError("Those passwords do not match");
      return;
    }

    act(
      () =>
        changeOwnPasswordAction({
          currentPassword: current,
          newPassword: next,
        }),
      {
        successMessage: hasPassword ? "Password changed" : "Password set",
        onDone: () => {
          setCurrent("");
          setNext("");
          setConfirm("");
        },
      },
    );
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {error && <Banner tone="error">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      {!hasPassword && (
        <Banner tone="warning">
          You sign in with Google. Setting a password gives you a second way in,
          which is useful if you ever lose access to that Google account.
        </Banner>
      )}

      {hasPassword && (
        <Field label="Current password">
          <input
            type="password"
            autoComplete="current-password"
            className={inputClass}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            disabled={pending}
            required
          />
        </Field>
      )}

      <Field
        label={hasPassword ? "New password" : "Password"}
        hint={`At least ${minLength} characters. A long phrase you will remember beats a short one with symbols in it.`}
      >
        <input
          type="password"
          autoComplete="new-password"
          minLength={minLength}
          className={inputClass}
          value={next}
          onChange={(event) => setNext(event.target.value)}
          disabled={pending}
          required
        />
      </Field>

      <Field label="Confirm password">
        <input
          type="password"
          autoComplete="new-password"
          minLength={minLength}
          className={inputClass}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          disabled={pending}
          required
        />
      </Field>

      <div>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : hasPassword
              ? "Change password"
              : "Set password"}
        </Button>
      </div>
    </form>
  );
}
