import { redirect } from "next/navigation";

import { AssignedOrdersPanel } from "~/components/teacher/assigned-orders-panel";
import { auth } from "~/server/auth";

export default async function TeacherOrdersPage() {
  const session = await auth();
  if (!session?.user || !["TEACHER", "ADMIN"].includes(session.user.role)) {
    redirect("/");
  }

  return <AssignedOrdersPanel />;
}
