function normalizeText(value: string | null | undefined) {
	return (value ?? "")
		.toLowerCase()
		.replace(/[\s.,;:!?。，、；：“”"'`~\-_/|()[\]{}]+/g, "")
		.trim();
}

function toCharSet(value: string) {
	return new Set(value.split(""));
}

function countOccurrences(text: string, pattern: string) {
	if (!pattern) {
		return 0;
	}

	let count = 0;
	let start = 0;
	while (true) {
		const index = text.indexOf(pattern, start);
		if (index === -1) {
			return count;
		}
		count += 1;
		start = index + pattern.length;
	}
}

export function shouldShowDistinctSummary(title: string | null | undefined, summary: string | null | undefined) {
	const normalizedTitle = normalizeText(title);
	const normalizedSummary = normalizeText(summary);

	if (!normalizedSummary) {
		return false;
	}

	if (!normalizedTitle) {
		return true;
	}

	if (normalizedTitle === normalizedSummary) {
		return false;
	}

	if (
		normalizedSummary.startsWith(normalizedTitle) ||
		normalizedTitle.startsWith(normalizedSummary)
	) {
		const lengthGap = Math.abs(normalizedSummary.length - normalizedTitle.length);
		if (lengthGap <= Math.max(8, Math.floor(normalizedTitle.length * 0.4))) {
			return false;
		}
	}

	const titleOccurrences = countOccurrences(normalizedSummary, normalizedTitle);
	if (
		titleOccurrences >= 1 &&
		normalizedSummary.startsWith(normalizedTitle) &&
		normalizedSummary.length <= normalizedTitle.length * 2.6
	) {
		return false;
	}

	const titleSet = toCharSet(normalizedTitle);
	const summarySet = toCharSet(normalizedSummary);
	let overlapCount = 0;
	for (const char of summarySet) {
		if (titleSet.has(char)) {
			overlapCount += 1;
		}
	}

	const overlapRatio = overlapCount / Math.max(1, Math.min(titleSet.size, summarySet.size));
	if (overlapRatio >= 0.85 && normalizedSummary.length <= normalizedTitle.length * 1.8) {
		return false;
	}

	return true;
}
