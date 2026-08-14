// app/admin/fees/pay/page.js
// The pay-fee kiosk (cash counter). The page is a thin server shell holding
// the metadata and the guard; the whole interactive flow lives in
// components/fees/PayKiosk.js.

import BackLink from "@/components/BackLink";
import PayKiosk from "@/components/fees/PayKiosk";
import { requireActiveSession } from "@/lib/guard";

export const metadata = { title: "Pay fee | Greenwood School" };

export default async function AdminPayFeePage() {
	await requireActiveSession();

	return (
		<div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-12">
			<BackLink href="/admin/fees" label="FEES" />
			<p className="label-micro mt-4 text-muted">PORTAL / ADMIN / FEES / PAY</p>
			<h1 className="mt-3 text-3xl">Pay fee</h1>
			<p className="mt-2 text-sm text-muted">
				Search the parent&apos;s registered mobile number to start.
			</p>

			<PayKiosk />
		</div>
	);
}
