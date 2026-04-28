import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  csAccountName: string;
  csDomainId: string;
  csAccountId: string;
};

/**
 * Resolve the current authenticated user (session + DB). Throws if there is
 * no session — API routes should call this and convert errors to 401.
 */
export async function requireUser(): Promise<CurrentUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new HttpError(401, "unauthorized");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      csAccountName: true,
      csDomainId: true,
      csAccountId: true
    }
  });
  if (!user) {
    throw new HttpError(401, "user_not_found");
  }
  return user;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
