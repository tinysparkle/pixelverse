import { ProxyAgent } from "undici";

const proxyUrl =
	process.env.OUTBOUND_PROXY ||
	process.env.HTTPS_PROXY ||
	process.env.HTTP_PROXY ||
	process.env.ALL_PROXY ||
	undefined;

const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

type ProxyableRequestInit = RequestInit & {
	dispatcher?: ProxyAgent;
};

export function fetchWithOptionalProxy(input: RequestInfo | URL, init?: RequestInit) {
	if (!proxyAgent) {
		return fetch(input, init);
	}

	return fetch(input, {
		...(init ?? {}),
		dispatcher: proxyAgent,
	} as ProxyableRequestInit);
}