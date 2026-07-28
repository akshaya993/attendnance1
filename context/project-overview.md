# PROJECT OVERVIEW
## School App - Multi-Branch School Management System (India)

> CONTEXT FILE 1 of 6. Read together with: architecture.md, code-standards.md,
> ui-context.md, ai-workflow-rules.md, progress-tracker.md.

## What this product is

A production-ready, multi-branch school management web app (PWA) for schools in
India, built and maintained by ONE person using AI coding tools. It replaces paper
registers and WhatsApp chaos with one app for attendance, fees, marks, buses, chat,
notices, admissions, timetables, leaves, complaints, posts, and year-end promotions.

## Users and roles (exactly 4)

| Role | Who | Main screens |
|---|---|---|
| admin | School office/principal per branch | Dashboards: fees, attendance, marks, admissions, complaints, timetable builder, promotions, user management |
| teacher | Class & subject teachers | Mark attendance, enter marks, apply leaves, class groups, view timetable |
| parent | One login per family (phone number) | Child dashboard: attendance %, results, fee dues + receipts, bus live map, notices, chat, complaints |
| bus | One login per bus (driver's phone) | Single screen: start/stop location sharing |

Login ID is always a 10-digit phone number. Password-primary auth with OTP for
reset/first login. One profiles table holds all logins with a role column.

## The 14 features (each has its own master-prompt file)

01 Attendance (exception-only), 02 Bus tracking (in-place GPS + ETA alarms),
03 Complaints & AI feedback, 04 Fees (installments, receipts, PDF), 05 Group chat,
06 Leaves, 07 Marks & report cards, 08 Admissions, 09 Notifications (web-push
fan-out), 10 Timetable (drag-drop builder + conflict check), 11 Profiles & user
management, 12 Posts (photo feed), 13 Auth/OTP/security, 14 Promotions & year-end
(+ audit log).

## Hard constraints (NEVER violate)

1. 100% open-source. No paid/lock-in services (no Prisma, Supabase, Firebase, Clerk).
2. Full control: our VPS, our PostgreSQL, files on our disk.
3. Low cost + low resource use: must run well on ONE cheap VPS.
4. Must survive thousands of parallel requests (result day, fee deadline day).
5. Smooth on cheap low-RAM Android phones: server-rendered pages, minimal client JS.
6. One codebase, JavaScript only. Smallest possible surface area.
7. India-only for v1: IST timezone, INR currency, academic year format '2026-27'.

## Current status

- Database: DONE. PostgreSQL 16 local, 43 tables + 25 indexes, seeded with a full
  fake school (400 students, 16 classes, 20 teachers, fees/marks/attendance/etc.).
- App skeleton: DONE. Next.js (App Router, JS) + Tailwind + pg/bcryptjs/jose.
  /api/health returns {"ok":true,"students":400}.
- Now building features in this exact order:
  01-Prompt0 -> 13 -> 09 -> 01 -> 04 -> 05 -> 07 -> 10 -> 02 -> 03 -> 06 -> 08
  -> 12 -> 14 -> 11 -> deploy.
- See progress-tracker.md for live status.

## Mobile strategy

v1 is an installable PWA (manifest + service worker, added with feature 09).
Later: Play Store via TWA wrapper (no code change), Capacitor only if background
GPS demands it. Mobile is a WRAPPER around this app - never a separate codebase.
