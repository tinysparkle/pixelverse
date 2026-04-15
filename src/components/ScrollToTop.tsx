"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./ScrollToTop.module.css";

const SHOW_AFTER_PX = 400;

export default function ScrollToTop() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const onScroll = () => {
			setVisible(window.scrollY > SHOW_AFTER_PX);
		};
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	const scrollTop = useCallback(() => {
		window.scrollTo({ top: 0, behavior: "smooth" });
	}, []);

	return (
		<button
			type="button"
			className={`${styles.button} ${visible ? styles.visible : styles.hidden}`}
			onClick={scrollTop}
			aria-label="回到顶部"
		>
			↑
		</button>
	);
}
