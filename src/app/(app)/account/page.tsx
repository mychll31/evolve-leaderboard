import { eq } from "drizzle-orm";
import { Avatar, Card, SectionTitle } from "@/components/ui";
import { NameForm, PasswordForm } from "@/components/account/AccountForms";
import { AvatarCropper } from "@/components/account/AvatarCropper";
import { getDb } from "@/db/client";
import { MIN_PASSWORD_LENGTH } from "@/db/mutations/password";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/guards";

export default async function AccountPage() {
  const user = await requireUser();

  const [row] = await getDb()
    .select({
      name: users.name,
      email: users.email,
      image: users.image,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const name = row?.name ?? row?.email ?? "Member";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5">
      <Card>
        <SectionTitle>PROFILE PHOTO</SectionTitle>
        <div className="mt-4 flex items-center gap-4">
          <Avatar
            initials={name.slice(0, 2).toUpperCase()}
            image={row?.image}
            color="var(--color-primary)"
            size={64}
          />
          <div className="min-w-0">
            <div className="text-ink truncate text-[15px] font-extrabold">
              {name}
            </div>
            <div className="text-ink-3 truncate text-[12px] font-semibold">
              {row?.email}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <AvatarCropper hasAvatar={Boolean(row?.image)} />
        </div>
      </Card>

      <Card>
        <SectionTitle>YOUR NAME</SectionTitle>
        <div className="mt-4">
          <NameForm name={name} />
        </div>
      </Card>

      <Card>
        <SectionTitle>
          {row?.passwordHash ? "CHANGE PASSWORD" : "SET A PASSWORD"}
        </SectionTitle>
        <div className="mt-4">
          <PasswordForm
            hasPassword={Boolean(row?.passwordHash)}
            minLength={MIN_PASSWORD_LENGTH}
          />
        </div>
      </Card>
    </div>
  );
}
