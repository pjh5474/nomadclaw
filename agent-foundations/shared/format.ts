export function formatRemaining(endAt: number, now: number) {
	const remainingMs = Math.max(0, endAt - now);
	const totalSeconds = Math.floor(remainingMs / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}분 ${seconds.toString().padStart(2, "0")}초`;
}

export function formatDeadline(endAt: number) {
	return new Date(endAt).toLocaleString("ko-KR", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}
