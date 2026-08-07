// The post-login router. This page renders NOTHING.
//
// WHY IT EXISTS
// app/api/auth/login/route.js sends every successful login to "/". This file
// is the one place that decides where each role actually goes, so the login
// route never has to know about dashboards and never needs editing when a new
// role or dashboard appears.
//
// requireActiveSession() runs FIRST, so a revoked session is bounced to
// /login?expired=1 and a user owing a password change is bounced to
// /first-login BEFORE any role routing happens.
//
// profile.role is constrained by the database to exactly these four values
// (profiles.role CHECK in db/schema.sql), and each one has a matching folder
// under app/. The fallback exists only so a future fifth role fails loudly in
// one obvious place instead of 404ing somewhere confusing.

import { redirect } from "next/navigation";

import { requireActiveSession } from "@/lib/guard";

// role value -> URL. These four URLs are also gated by ROLE_PREFIXES in
// proxy.js. If you add a row here, add the matching gate there too.
const ROLE_HOME = {
  admin: "/admin",
  teacher: "/teacher",
  parent: "/parent",
  bus: "/bus",
};

export default async function HomePage() {
  const { profile } = await requireActiveSession();

  redirect(ROLE_HOME[profile.role] ?? "/login?expired=1");
}