"use client";

// components/fees/PayKiosk.js
// The office's cash counter: search a parent by phone -> pick a child -> pick
// ONE fee category -> enter amount + mode -> confirm -> receipt.
//
// THE SESSION STAYS OPEN AFTER A PAYMENT. The dues list refreshes in place so
// the admin can collect another category (bus, then tuition...) without
// re-searching. Only the page's back button ends the session.
//
// CLIENT-SIDE VALIDATION IS A COURTESY ONLY. The server re-checks everything
// (amount > 0, amount <= balance, branch, row lock) inside the transaction.
// Money travels as a STRING the whole way - never a JavaScript float.

import { useState } from "react";
import { feeCategoryLabel, formatMoney } from "@/lib/format";

const PAYMENT_MODES = [
	{ value: "cash", label: "Cash" },
	{ value: "card", label: "Card" },
	{ value: "upi", label: "UPI" },
];

export default function PayKiosk() {
	// search state
	const [phone, setPhone] = useState("");
	const [searching, setSearching] = useState(false);
	const [searchError, setSearchError] = useState("");

	// session state (survives payments until the admin leaves)
	const [parent, setParent] = useState(null);
	const [students, setStudents] = useState([]);
	const [selectedStudentId, setSelectedStudentId] = useState(null);

	// payment state
	const [selectedFeeId, setSelectedFeeId] = useState(null);
	const [amount, setAmount] = useState("");
	const [paymentMode, setPaymentMode] = useState("cash");
	const [confirming, setConfirming] = useState(false);
	const [paying, setPaying] = useState(false);
	const [payError, setPayError] = useState("");
	const [receipt, setReceipt] = useState(null);

	const selectedStudent = students.find((s) => s.id === selectedStudentId) ?? null;
	const pendingFees = selectedStudent?.pendingFees ?? [];
	const selectedFee = pendingFees.find((f) => f.feeId === selectedFeeId) ?? null;

	// Client-side mirror of the server rule: 0 < amount <= balance.
	const amountNumber = Number(amount);
	const amountProblem = !selectedFee
		? null
		: !amount || Number.isNaN(amountNumber) || amountNumber <= 0
			? "Enter a valid amount"
			: amountNumber > Number(selectedFee.balanceDue)
				? `Entered amount exceeded the due (${formatMoney(selectedFee.balanceDue)})`
				: null;

	async function runSearch(phoneNumber) {
		setSearching(true);
		setSearchError("");
		setReceipt(null);
		try {
			const res = await fetch(
				`/api/fees/search?phone=${encodeURIComponent(phoneNumber)}`
			);
			const payload = await res.json().catch(() => null);
			if (!res.ok || !payload?.ok) {
				setSearchError(payload?.error || "Search failed. Please try again.");
				return;
			}
			setParent(payload.data.parent);
			setStudents(payload.data.students);
			setSelectedStudentId(payload.data.students[0]?.id ?? null);
			setSelectedFeeId(null);
			setAmount("");
			setConfirming(false);
		} catch {
			setSearchError("Cannot reach the server. Check your connection.");
		} finally {
			setSearching(false);
		}
	}

	function handleSearchSubmit(event) {
		event.preventDefault();
		const digits = phone.replace(/\D/g, "").slice(0, 10);
		setPhone(digits);
		if (digits.length !== 10) {
			setSearchError("Enter a valid 10-digit phone number");
			return;
		}
		runSearch(digits);
	}

	// Refresh the dues after a payment WITHOUT touching the success card or
	// the search box. The session stays open for the next category.
	async function refreshDues() {
		try {
			const res = await fetch(
				`/api/fees/search?phone=${encodeURIComponent(phone)}`
			);
			const payload = await res.json().catch(() => null);
			if (!res.ok || !payload?.ok) return;
			setStudents(payload.data.students);
		} catch {
			// A silent refresh failure is fine - the next payment revalidates
			// everything server-side anyway.
		}
	}

	async function handlePay() {
		if (!selectedFee || amountProblem) return;
		setPaying(true);
		setPayError("");
		try {
			const res = await fetch("/api/fees/pay", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					feeId: selectedFee.feeId,
					amount: amount.trim(),
					paymentMode,
				}),
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok || !payload?.ok) {
				setPayError(payload?.error || "Payment failed. Please try again.");
				setConfirming(false);
				return;
			}

			setReceipt(payload.data);
			setConfirming(false);
			setSelectedFeeId(null);
			setAmount("");

			// The saved payment is the truth; the dues list just catches up.
			await refreshDues();
		} catch {
			setPayError("Cannot reach the server. Check your connection.");
			setConfirming(false);
		} finally {
			setPaying(false);
		}
	}

	// -------------------------------------------------- render --------------------------------------------------

	return (
		<div className="mt-6 space-y-6">
			{/* ---------- STEP 1: FIND THE FAMILY ---------- */}
			<div className="card p-6">
				<p className="label-micro">FIND PARENT</p>
				<form onSubmit={handleSearchSubmit} className="mt-3 flex gap-3">
					<input
						type="tel"
						inputMode="numeric"
						placeholder="Parent's registered mobile number"
						value={phone}
						onChange={(event) =>
							setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))
						}
						disabled={searching || paying}
						className="field flex-1"
					/>
					<button
						type="submit"
						disabled={searching || paying}
						className="cta shrink-0 transition-transform duration-150 active:scale-[0.98]"
					>
						{searching ? "Searching..." : "Search"}
					</button>
				</form>
				{searchError ? (
					<p role="alert" className="mt-3 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
						{searchError}
					</p>
				) : null}
			</div>

			{/* ---------- STEP 2: CHILD + DUES ---------- */}
			{parent ? (
				<div className="card p-6">
					<p className="label-micro text-muted">PARENT</p>
					<p className="mt-2 text-lg">{parent.fullName}</p>
					<p className="text-sm text-muted">{parent.phoneNumber}</p>

					{students.length > 1 ? (
						<div className="mt-4 flex flex-wrap gap-2">
							{students.map((student) => (
								<button
									key={student.id}
									type="button"
									onClick={() => {
										setSelectedStudentId(student.id);
										setSelectedFeeId(null);
										setReceipt(null);
									}}
									className={`pill border transition-colors duration-150 ${
										student.id === selectedStudentId
											? "border-line bg-raised text-body"
											: "border-soft text-muted hover:text-body"
									}`}
								>
									{student.fullName} ({student.classNumber}
									{student.section})
								</button>
							))}
						</div>
					) : null}

					{selectedStudent ? (
						<div className="mt-5">
							<p className="label-micro text-muted">
								PENDING DUES - {selectedStudent.fullName}, Class{" "}
								{selectedStudent.classNumber} {selectedStudent.section}
							</p>

							{pendingFees.length === 0 ? (
								<p className="mt-3 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok">
									No pending dues for this child.
								</p>
							) : (
								<div className="card mt-3 overflow-hidden p-0">
									{pendingFees.map((fee) => {
										const selected = fee.feeId === selectedFeeId;
										return (
											<button
												key={fee.feeId}
												type="button"
												onClick={() => {
													setSelectedFeeId(fee.feeId);
													setReceipt(null);
												}}
												aria-pressed={selected}
												className={`flex min-h-12 w-full items-center justify-between gap-3 border-b border-soft px-4 py-3 text-left transition-colors duration-150 last:border-b-0 ${
													selected ? "bg-raised" : "hover:bg-raised"
												}`}
											>
												<span className="flex items-center gap-3">
													{/* radio ring - one category per payment */}
													<span
														className={`h-4 w-4 rounded-full border ${
															selected
																? "border-body bg-body"
																: "border-line bg-transparent"
														}`}
														aria-hidden="true"
													/>
													<span className="text-sm">
														{feeCategoryLabel(fee.category)}
													</span>
												</span>
												<span className="font-mono text-[13px]">
													{formatMoney(fee.balanceDue)}
												</span>
											</button>
										);
									})}
								</div>
							)}
						</div>
					) : null}
				</div>
			) : null}

			{/* ---------- STEP 3: AMOUNT + MODE ---------- */}
			{selectedFee ? (
				<div className="card p-6">
					<p className="label-micro">PAYMENT - {feeCategoryLabel(selectedFee.category).toUpperCase()}</p>

					<label className="mt-4 block">
						<span className="text-sm text-muted">
							Amount received (due: {formatMoney(selectedFee.balanceDue)})
						</span>
						<input
							type="text"
							inputMode="decimal"
							placeholder="0.00"
							value={amount}
							onChange={(event) => setAmount(event.target.value)}
							disabled={paying}
							className="field mt-1.5 w-full"
						/>
					</label>
					{amount && amountProblem ? (
						<p role="alert" className="mt-2 text-sm text-danger">
							{amountProblem}
						</p>
					) : null}

					<p className="label-micro mt-5 text-muted">PAYMENT MODE</p>
					<div className="mt-2 flex flex-wrap gap-2">
						{PAYMENT_MODES.map((mode) => (
							<button
								key={mode.value}
								type="button"
								onClick={() => setPaymentMode(mode.value)}
								aria-pressed={paymentMode === mode.value}
								className={`rounded-lg border px-4 py-2.5 text-sm transition-colors duration-150 ${
									paymentMode === mode.value
										? "border-line bg-raised text-body"
										: "border-soft text-muted hover:text-body"
								}`}
							>
								{mode.label}
							</button>
						))}
					</div>

					{payError ? (
						<p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
							{payError}
						</p>
					) : null}

					{confirming ? (
						/* Money actions always get an explicit confirm (UI context rule 6). */
						<div className="card mt-5 border-line p-5">
							<p className="label-micro text-warn">CONFIRM PAYMENT</p>
							<p className="mt-3 text-base">
								Process {formatMoney(amount)} for{" "}
								{feeCategoryLabel(selectedFee.category)} fees of{" "}
								{selectedStudent?.fullName}?
							</p>
							<div className="mt-5 flex flex-wrap gap-3">
								<button
									type="button"
									onClick={handlePay}
									disabled={paying}
									className="cta transition-transform duration-150 active:scale-[0.98]"
								>
									{paying ? "Processing..." : "Yes, process payment"}
								</button>
								<button
									type="button"
									onClick={() => setConfirming(false)}
									disabled={paying}
									className="min-h-11 px-4 text-sm text-muted hover:text-body"
								>
									Go back
								</button>
							</div>
						</div>
					) : (
						<button
							type="button"
							onClick={() => setConfirming(true)}
							disabled={!selectedFee || Boolean(amountProblem) || paying}
							className="cta mt-5 w-full transition-transform duration-150 active:scale-[0.98]"
						>
							Process payment &amp; generate receipt
						</button>
					)}
				</div>
			) : null}

			{/* ---------- STEP 4: RECEIPT ---------- */}
			{receipt ? (
				<div className="card border-l-[3px] border-l-ok p-6">
					<p className="label-micro text-ok">PAYMENT RECORDED</p>
					<p className="mt-3 text-lg">
						{formatMoney(receipt.amountPaid)} - {feeCategoryLabel(receipt.category)}
					</p>
					<p className="mt-2 text-sm text-muted">
						Receipt no. {receipt.receiptNumber} - new balance{" "}
						{formatMoney(receipt.newBalance)}
					</p>
					<div className="mt-5 flex flex-wrap gap-3">
						<a
							href={`/fees/admin/receipt/${receipt.receiptNumber}`}
							target="_blank"
							rel="noopener noreferrer"
							className="cta"
						>
							Print / download receipt
						</a>
						<p className="label-micro self-center text-muted">
							Session open - pick the next due above
						</p>
					</div>
				</div>
			) : null}
		</div>
	);
}
