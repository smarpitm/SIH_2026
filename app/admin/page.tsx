import { redirect } from "next/navigation";

// K15: the admin dashboard (KPIs, district pendency, exports, invite) lives at
// /admin/dashboard now — /admin just forwards to it (single implementation).
export default function AdminPage() {
  redirect("/admin/dashboard");
}