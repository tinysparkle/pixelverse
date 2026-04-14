"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { NewsItemDetail, NewsItemSummary, NewsKeywordRecord } from "@/lib/db/types";
import styles from "./news.module.css";
import { shouldShowDistinctSummary } from "./summary-utils";

type FilterView = "all" | "unread";

type SseStatus = "connecting" | "online" | "offline";

const SUGGESTED_KEYWORDS = ["AI", "大模型", "股市", "NASA", "SpaceX"];
const MIN_REFRESH_MINUTES = process.env.NODE_ENV === "development" ? 1 : 5;

function clampIntervalMinutes(value: number) {
	return Math.min(60, Math.max(MIN_REFRESH_MINUTES, Number.isFinite(value) ? value : 10));
}

function normalizeIntervalDraft(value: string) {
	return value.replace(/[^\d]/g, "").slice(0, 2);
}

function resolveIntervalMinutes(draft: string) {
	const parsed = Number.parseInt(draft, 10);
	return clampIntervalMinutes(Number.isNaN(parsed) ? 10 : parsed);
}

function timeAgo(iso: string | null): string {
	if (!iso) return "";
	const diff = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 60) return `${mins}分钟前`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}小时前`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}天前`;
	return new Date(iso).toLocaleDateString("zh-CN");
}

function groupDateLabel(iso: string | null): string {
	if (!iso) return "更早";
	const d = new Date(iso);
	const now = new Date();
	const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const startYesterday = startToday - 24 * 60 * 60 * 1000;
	const t = d.getTime();
	if (t >= startToday) return "今天";
	if (t >= startYesterday) return "昨天";
	return "更早";
}

export default function NewsPage() {
	const [items, setItems] = useState<NewsItemSummary[]>([]);
	const [keywords, setKeywords] = useState<NewsKeywordRecord[]>([]);
	const [selectedItem, setSelectedItem] = useState<NewsItemDetail | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [loading, setLoading] = useState(true);
	const [filterView, setFilterView] = useState<FilterView>("all");
	const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
	const [newKeyword, setNewKeyword] = useState("");
	const [digestLoading, setDigestLoading] = useState(false);
	const [digest, setDigest] = useState<string | null>(null);
	const [showOriginal, setShowOriginal] = useState<Set<string>>(new Set());
	const [sseStatus, setSseStatus] = useState<SseStatus>("connecting");
	const [refreshing, setRefreshing] = useState(false);
	const [lastUpdateCount, setLastUpdateCount] = useState(0);
	const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());
	const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
	const [activeIntervalMinutes, setActiveIntervalMinutes] = useState(10);
	const [intervalDraft, setIntervalDraft] = useState("10");
	const itemsRef = useRef<NewsItemSummary[]>([]);

	const fetchKeywords = useCallback(async () => {
		const res = await fetch("/api/news/keywords");
		if (res.ok) {
			setKeywords(await res.json());
		}
	}, []);

	useEffect(() => {
		void fetchKeywords();
	}, [fetchKeywords]);

	useEffect(() => {
		itemsRef.current = items;
	}, [items]);

	useEffect(() => {
		const interval = clampIntervalMinutes(activeIntervalMinutes);
		const es = new EventSource(
			`/api/news/stream?autoRefresh=${autoRefreshEnabled ? "1" : "0"}&intervalMinutes=${interval}`
		);
		setSseStatus("connecting");

		es.addEventListener("open", () => {
			setSseStatus("online");
		});

		es.addEventListener("init", (ev) => {
			try {
				const payload = JSON.parse((ev as MessageEvent).data) as {
					items: NewsItemSummary[];
				};
				setItems(payload.items ?? []);
				setLoading(false);
			} catch {
				setLoading(false);
			}
		});

		es.addEventListener("refreshing", () => {
			setRefreshing(true);
		});

		es.addEventListener("update", (ev) => {
			try {
				const payload = JSON.parse((ev as MessageEvent).data) as {
					items: NewsItemSummary[];
					count?: number;
				};
				const incoming = payload.items ?? [];
				if (incoming.length > 0) {
					const seen = new Set(itemsRef.current.map((x) => x.id));
					const deduped = incoming.filter((x) => !seen.has(x.id));
					if (deduped.length > 0) {
						setItems((prev) => [...deduped, ...prev]);
						setLastUpdateCount(deduped.length);
						setNewItemIds((prev) => new Set([...prev, ...deduped.map((x) => x.id)]));
						itemsRef.current = [...deduped, ...itemsRef.current];
					}
				}
			} finally {
				setRefreshing(false);
				setLoading(false);
			}
		});

		es.addEventListener("error", () => {
			setSseStatus("offline");
			setRefreshing(false);
		});

		es.onerror = () => {
			setSseStatus("offline");
		};

		return () => {
			es.close();
		};
	}, [autoRefreshEnabled, activeIntervalMinutes]);

	const handleDigest = async () => {
		setDigestLoading(true);
		try {
			const res = await fetch("/api/news/digest", { method: "POST" });
			if (res.ok) {
				const data = await res.json();
				setDigest(data.digest);
			}
		} finally {
			setDigestLoading(false);
		}
	};

	const addKeyword = async (keyword: string) => {
		const kw = keyword.trim();
		if (!kw) return;
		const res = await fetch("/api/news/keywords", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ keyword: kw }),
		});
		if (res.ok) {
			setKeywords(await res.json());
			setNewKeyword("");
		}
	};

	const handleDeleteKeyword = async (id: string) => {
		const res = await fetch(`/api/news/keywords/${id}`, { method: "DELETE" });
		if (res.ok) {
			setKeywords((prev) => prev.filter((k) => k.id !== id));
			if (activeKeyword && keywords.find((k) => k.id === id)?.keyword === activeKeyword) {
				setActiveKeyword(null);
			}
		}
	};

	const handleMarkRead = async (newsId: string) => {
		await fetch(`/api/news/${newsId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "read" }),
		});
		setItems((prev) =>
			prev.map((item) => (item.id === newsId ? { ...item, read: true } : item))
		);
		setSelectedItem((prev) => (prev && prev.id === newsId ? { ...prev, read: true } : prev));
	};

	const handleOpenDetail = async (newsId: string) => {
		setDetailLoading(true);
		try {
			const [detailRes] = await Promise.all([fetch(`/api/news/${newsId}`), handleMarkRead(newsId)]);
			if (detailRes.ok) {
				const data: NewsItemDetail = await detailRes.json();
				setSelectedItem({ ...data, read: true });
			}
		} finally {
			setDetailLoading(false);
		}
	};

	// 切换关键词时重置更新提示
	useEffect(() => {
		setLastUpdateCount(0);
		setNewItemIds(new Set());
	}, [activeKeyword]);

	// 30 秒后自动清除新消息标记
	useEffect(() => {
		if (newItemIds.size === 0) return;
		const timer = setTimeout(() => {
			setNewItemIds(new Set());
			setLastUpdateCount(0);
		}, 30000);
		return () => clearTimeout(timer);
	}, [newItemIds]);

	const toggleOriginal = (id: string) => {
		setShowOriginal((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const formatAbsoluteDate = (iso: string | null) => {
		if (!iso) return "未知时间";
		return new Date(iso).toLocaleString("zh-CN", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const filteredItems = useMemo(() => {
		return items.filter((item) => {
			if (filterView === "unread" && item.read) return false;
			if (activeKeyword) {
				const kw = activeKeyword.toLowerCase();
				const haystack = [
					item.title,
					item.titleZh ?? "",
					item.summary ?? "",
					item.summaryZh ?? "",
					item.searchKeyword ?? "",
					...item.tags,
				]
					.join(" ")
					.toLowerCase();
				if (!haystack.includes(kw)) return false;
			}
			return true;
		});
	}, [items, filterView, activeKeyword]);

	const groupedItems = useMemo(() => {
		const groups = new Map<string, NewsItemSummary[]>();
		for (const item of filteredItems) {
			const label = groupDateLabel(item.publishedAt);
			const list = groups.get(label) ?? [];
			list.push(item);
			groups.set(label, list);
		}
		return ["今天", "昨天", "更早"]
			.map((label) => ({ label, items: groups.get(label) ?? [] }))
			.filter((g) => g.items.length > 0);
	}, [filteredItems]);

	const viewCounts = useMemo(() => {
		let unread = 0;
		for (const item of filteredItems) {
			if (!item.read) unread++;
		}
		return { all: filteredItems.length, unread };
	}, [filteredItems]);

	return (
		<div className={styles.page}>
			<header className={styles.header}>
				<Link className={styles.brand} href="/">
					<strong>Pixelverse</strong>
					<span className={styles.brandSep}>/</span>
					<span>热点雷达</span>
				</Link>
				<nav className={styles.nav}>
					<Link href="/">首页</Link>
					<Link href="/tasks">任务</Link>
					<Link href="/notes">云笔记</Link>
				</nav>
			</header>

			<div className={styles.layout}>
				<section className={styles.keywordHero}>
					<div className={styles.keywordHeroTitle}>🔍 关注话题</div>
					<div className={styles.keywordList}>
						{keywords.map((kw) => (
							<span
								key={kw.id}
								className={`${styles.keywordTag} ${
									activeKeyword === kw.keyword ? styles.keywordActive : ""
								}`}
								onClick={() =>
									setActiveKeyword(activeKeyword === kw.keyword ? null : kw.keyword)
								}
							>
								{kw.keyword}
								<span
									className={styles.keywordRemove}
									onClick={(e) => {
										e.stopPropagation();
										void handleDeleteKeyword(kw.id);
									}}
								>
									×
								</span>
							</span>
						))}
					</div>
					<div className={styles.keywordAddRow}>
						<input
							className={styles.keywordInput}
							placeholder="添加话题关键词..."
							value={newKeyword}
							onChange={(e) => setNewKeyword(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && void addKeyword(newKeyword)}
						/>
						<button className={styles.keywordAddBtn} onClick={() => void addKeyword(newKeyword)}>
							+
						</button>
					</div>
					{keywords.length === 0 && (
						<div className={styles.emptyKeywordHint}>
							<div>添加你关注的话题，开始追踪热点。</div>
							<div className={styles.suggestedKeywords}>
								{SUGGESTED_KEYWORDS.map((kw) => (
									<button key={kw} onClick={() => void addKeyword(kw)}>
										{kw}
									</button>
								))}
							</div>
						</div>
					)}
				</section>

				<main className={styles.main}>
					<div className={styles.toolbar}>
						<div className={styles.toolbarLeft}>
							<div className={styles.filterTabs}>
								<button
									className={filterView === "all" ? styles.filterActive : ""}
									onClick={() => setFilterView("all")}
								>
									全部 ({viewCounts.all})
								</button>
								<button
									className={filterView === "unread" ? styles.filterActive : ""}
									onClick={() => setFilterView("unread")}
								>
									未读 ({viewCounts.unread})
								</button>
							</div>
							<span className={styles.currentKeyword}>
								{activeKeyword ? `当前话题: ${activeKeyword}` : "当前话题: 全部"}
							</span>
						</div>

						<div className={styles.toolbarRight}>
							<label className={styles.autoToggle}>
								<input
									type="checkbox"
									checked={autoRefreshEnabled}
									onChange={(e) => {
										const enabled = e.target.checked;
										if (enabled) {
											const resolvedMinutes = resolveIntervalMinutes(intervalDraft);
											setActiveIntervalMinutes(resolvedMinutes);
											setIntervalDraft(String(resolvedMinutes));
										}
										setAutoRefreshEnabled(enabled);
										if (!enabled) {
											setRefreshing(false);
										}
									}}
								/>
								<span className={styles.switchTrack} aria-hidden="true">
									<span className={styles.switchThumb} />
								</span>
								<span>自动推送</span>
							</label>
							<label className={styles.intervalControl}>
								<span>间隔</span>
								<input
									type="text"
									inputMode="numeric"
									pattern="[0-9]*"
									value={intervalDraft}
									onChange={(e) => {
										setIntervalDraft(normalizeIntervalDraft(e.target.value));
									}}
									onBlur={() => {
										if (autoRefreshEnabled) return;
										setIntervalDraft(String(resolveIntervalMinutes(intervalDraft)));
									}}
									disabled={autoRefreshEnabled}
									aria-label={`推送间隔分钟数，范围 ${MIN_REFRESH_MINUTES} 到 60`}
								/>
								<span>分钟</span>
							</label>
							<span
								className={`${styles.sseIndicator} ${
									sseStatus === "online" ? styles.sseOnline : styles.sseOffline
								}`}
							>
								{sseStatus === "online"
									? autoRefreshEnabled
										? "● 自动推送中"
										: "● 自动推送已关闭"
									: sseStatus === "connecting"
										? "◌ 连接中"
										: "○ 断开"}
							</span>
							<button
								className={styles.digestBtn}
								onClick={handleDigest}
								disabled={digestLoading}
							>
								{digestLoading ? "生成中..." : "✦ AI 摘要"}
							</button>
						</div>
					</div>

					{refreshing && <div className={styles.refreshHint}>正在拉取并过滤新内容...</div>}
					{lastUpdateCount > 0 && !refreshing && (
						<div className={styles.updateHint}>▲ {lastUpdateCount} 条新推送</div>
					)}

					{digest && (
						<div className={styles.digestPanel}>
							<div className={styles.digestHeader}>
								<span className={styles.digestLabel}>✦ 每日热点摘要</span>
								<button className={styles.digestClose} onClick={() => setDigest(null)}>
									×
								</button>
							</div>
							<div className={styles.digestContent}>{digest}</div>
						</div>
					)}

					{loading ? (
						<div className={styles.loading}>加载中...</div>
					) : groupedItems.length === 0 ? (
						<div className={styles.empty}>
							<span className={styles.emptyIcon}>
								<svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
									<rect x="6" y="1" width="4" height="1" />
									<rect x="4" y="2" width="8" height="1" />
									<rect x="3" y="3" width="10" height="1" />
									<rect x="3" y="4" width="10" height="1" />
									<rect x="3" y="5" width="10" height="1" />
									<rect x="3" y="6" width="10" height="1" />
									<rect x="2" y="7" width="12" height="1" />
									<rect x="2" y="8" width="12" height="1" />
									<rect x="1" y="9" width="14" height="1" />
									<rect x="1" y="10" width="14" height="1" />
									<rect x="0" y="11" width="16" height="1" />
									<rect x="6" y="12" width="4" height="1" />
									<rect x="7" y="13" width="2" height="1" />
								</svg>
							</span>
							<span className={styles.emptyText}>暂无内容，请先添加关键词</span>
						</div>
					) : (
						<div className={styles.groupList}>
							{groupedItems.map((group) => (
								<section key={group.label} className={styles.dateGroup}>
									<div className={styles.dateLabel}>{group.label}</div>
									<div className={styles.cardList}>
										{group.items.map((item) => {
											const isNewItem = newItemIds.has(item.id);
											return (
											<article
												key={item.id}
												className={`${styles.card} ${item.read ? styles.cardRead : ""} ${isNewItem ? styles.cardNew : ""}`}
												onClick={() => void handleOpenDetail(item.id)}
											>
												<div className={styles.cardMeta}>
													{isNewItem && (
														<span className={styles.newBadge} aria-label="新消息">
															NEW
														</span>
													)}
													<span className={styles.cardSource}>{item.source}</span>
													{item.searchKeyword && (
														<span className={styles.cardKeyword}>#{item.searchKeyword}</span>
													)}
													<span className={styles.cardScore}>★ {item.relevanceScore.toFixed(1)}</span>
													<span className={styles.cardTime}>{timeAgo(item.publishedAt)}</span>
												</div>

												<div className={styles.cardTitle}>{item.titleZh || item.title}</div>
												{item.titleZh && showOriginal.has(item.id) && (
													<div className={styles.cardTitleOriginal}>{item.title}</div>
												)}

												{(() => {
													const displayTitle = showOriginal.has(item.id)
														? item.title
														: item.titleZh || item.title;
													const displaySummary = showOriginal.has(item.id)
														? item.summary
														: item.summaryZh || item.summary;
													return shouldShowDistinctSummary(displayTitle, displaySummary) ? (
														<div className={styles.cardSummary}>{displaySummary}</div>
													) : null;
												})()}

												{item.tags.length > 0 && (
													<div className={styles.cardTags}>
														{item.tags.map((tag) => (
															<span key={tag} className={styles.cardTag}>
																{tag}
															</span>
														))}
													</div>
												)}

												<div className={styles.cardActions}>
													{item.titleZh && (
														<button
															className={styles.cardActionBtn}
															onClick={(e) => {
																e.stopPropagation();
																toggleOriginal(item.id);
															}}
														>
															{showOriginal.has(item.id) ? "中文" : "原文"}
														</button>
													)}
													<a
														className={`${styles.cardActionBtn} ${styles.cardLink}`}
														href={item.sourceUrl}
														target="_blank"
														rel="noopener noreferrer"
														onClick={(e) => e.stopPropagation()}
													>
														原文 →
													</a>
												</div>
											</article>
											);
										})}
									</div>
								</section>
							))}
						</div>
					)}
				</main>
			</div>

			{(selectedItem || detailLoading) && (
				<div className={styles.detailOverlay} onClick={() => setSelectedItem(null)}>
					<aside className={styles.detailPanel} onClick={(event) => event.stopPropagation()}>
						<div className={styles.detailHeader}>
							<div className={styles.detailHeaderMeta}>
								<span className={styles.detailSource}>{selectedItem?.source || "载入中"}</span>
								<span className={styles.detailTime}>
									{selectedItem ? formatAbsoluteDate(selectedItem.publishedAt) : "请稍候"}
								</span>
							</div>
							<button className={styles.detailClose} onClick={() => setSelectedItem(null)}>
								×
							</button>
						</div>

						{detailLoading || !selectedItem ? (
							<div className={styles.detailLoading}>详情加载中...</div>
						) : (
							<>
								<h2 className={styles.detailTitle}>{selectedItem.titleZh || selectedItem.title}</h2>
								{selectedItem.titleZh && (
									<div className={styles.detailOriginalTitle}>{selectedItem.title}</div>
								)}

								<div className={styles.detailMetaStrip}>
									<span>质量分 {selectedItem.relevanceScore.toFixed(1)}</span>
									{selectedItem.searchKeyword && <span>关键词 #{selectedItem.searchKeyword}</span>}
									<span>抓取于 {formatAbsoluteDate(selectedItem.fetchedAt)}</span>
								</div>

								{selectedItem.tags.length > 0 && (
									<div className={styles.detailTags}>
										{selectedItem.tags.map((tag) => (
											<span key={tag} className={styles.detailTag}>
												{tag}
											</span>
										))}
									</div>
								)}

								{shouldShowDistinctSummary(
									selectedItem.titleZh || selectedItem.title,
									selectedItem.summaryZh
								) && (
									<section className={styles.detailSection}>
										<div className={styles.detailSectionLabel}>中文摘要</div>
										<p className={styles.detailParagraph}>{selectedItem.summaryZh}</p>
									</section>
								)}

								{shouldShowDistinctSummary(selectedItem.title, selectedItem.content || selectedItem.summary) && (
									<section className={styles.detailSection}>
										<div className={styles.detailSectionLabel}>原文内容</div>
										<p className={styles.detailParagraph}>
											{selectedItem.content || selectedItem.summary}
										</p>
									</section>
								)}

								<div className={styles.detailActions}>
									<a
										className={`${styles.cardActionBtn} ${styles.detailLink}`}
										href={selectedItem.sourceUrl}
										target="_blank"
										rel="noopener noreferrer"
									>
										打开原文 →
									</a>
								</div>
							</>
						)}
					</aside>
				</div>
			)}
		</div>
	);
}
