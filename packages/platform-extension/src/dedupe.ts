import type { IndexEntry, LoginIndexEntry, SubdomainMatchMode } from "@core/adapters/autofill";
import { etld1 } from "./etld1";

const domainCache = new Map<string, string>();
const MAX_DOMAIN_CACHE = 2048;

/** eTLD+1 of a hostname; falls back to the raw input for IPs / unknown TLDs. Memoized:
 * the full-PSL lookup is the expensive part of every match, and the same handful of
 * hostnames is asked for on every query. */
export function registrableDomain(hostname: string): string {
	const cached = domainCache.get(hostname);
	if (cached !== undefined) return cached;
	const domain = etld1(hostname) ?? hostname;
	if (domainCache.size >= MAX_DOMAIN_CACHE) domainCache.clear();
	domainCache.set(hostname, domain);
	return domain;
}

/** Just the fields the hostname policy reads; any LoginIndexEntry satisfies it. */
export interface HostnameMatchable {
	hostnames: string[];
	subdomainMatch?: SubdomainMatchMode;
}

/** Whether a login entry matches a page host under its subdomainMatch policy (default eTLD+1). */
export function hostnameMatches(entry: HostnameMatchable, pageHostname: string): boolean {
	const pageHost = pageHostname.toLowerCase();
	const policy = entry.subdomainMatch ?? "etld1";
	// Compute the page side once for this entry's hostnames. Unknown stored policies
	// follow the same eTLD+1 fallback as hostnameMatchesEntry's default branch.
	const pageDomain =
		policy === "exact" || policy === "subdomain" ? pageHost : registrableDomain(pageHost);
	for (const raw of entry.hostnames) {
		if (hostnameMatchesEntry(raw, policy, pageHost, pageDomain)) return true;
	}
	return false;
}

/** Single-hostname check with the page side precomputed (see hostnameMatches). */
function hostnameMatchesEntry(
	entryHostname: string,
	policy: SubdomainMatchMode,
	pageHost: string,
	pageDomain: string,
): boolean {
	const entryHost = entryHostname.toLowerCase();
	switch (policy) {
		case "exact":
			return entryHost === pageHost;
		case "subdomain":
			return pageHost === entryHost || pageHost.endsWith(`.${entryHost}`);
		default:
			return registrableDomain(entryHost) === pageDomain;
	}
}

/** Result of matching a captured credential against the index: identical, new, or update-an-existing. */
export type DedupeOutcome =
	| { kind: "exact" }
	| { kind: "save" }
	| { kind: "update"; candidates: LoginIndexEntry[] };

/** Classify a captured credential vs the vault index. Null index (locked) degrades to save. */
export function dedupeCapture(
	index: Map<string, IndexEntry> | null,
	hostname: string,
	username: string,
	password: string,
): DedupeOutcome {
	if (!index) return { kind: "save" };
	const candidates: LoginIndexEntry[] = [];
	for (const entry of index.values()) {
		if (entry.type !== "login") continue;
		if (!hostnameMatches(entry, hostname)) continue;
		if (entry.username === username && entry.password === password) {
			return { kind: "exact" };
		}
		candidates.push(entry);
	}
	if (candidates.length === 0) return { kind: "save" };
	// Same-username matches float to the top.
	candidates.sort((a, b) => {
		const aMatch = a.username === username ? 0 : 1;
		const bMatch = b.username === username ? 0 : 1;
		return aMatch - bMatch;
	});
	return { kind: "update", candidates };
}
