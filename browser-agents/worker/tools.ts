import { tool } from "ai";
import { z } from "zod";
import puppeteer from "@cloudflare/puppeteer";

type SeoCheckResult = {
	name: string;
	passed: boolean;
	value: string | null;
	detail: string;
};

type SeoAuditResult = {
	url: string;
	checks: SeoCheckResult[];
	score: number;
	filename: string;
};

/**
 * page.evaluate() 에 전달할 SEO 검사 로직.
 * 브라우저 컨텍스트에서 실행되므로 DOM API를 사용합니다.
 * evaluate() 에는 문자열을 넘겨 worker tsconfig의 DOM 타입 부재 문제를 우회합니다.
 */
const SEO_CHECK_SCRIPT = `(() => {
	const checks = [];

	// 1. <title>
	const titleEl = document.querySelector("title");
	const title = titleEl ? titleEl.textContent.trim() : null;
	const titleLen = title ? title.length : 0;
	checks.push({
		name: "title",
		passed: !!title && titleLen >= 10 && titleLen <= 60,
		value: title,
		detail: title ? titleLen + "자 (권장 10~60자)" : "<title> 태그 없음",
	});

	// 2. <meta name="description">
	const descEl = document.querySelector('meta[name="description"]');
	const desc = descEl ? descEl.content.trim() : null;
	const descLen = desc ? desc.length : 0;
	checks.push({
		name: "meta-description",
		passed: !!desc && descLen >= 50 && descLen <= 160,
		value: desc,
		detail: desc ? descLen + "자 (권장 50~160자)" : '<meta name="description"> 없음',
	});

	// 3. <h1> 정확히 1개
	const h1s = document.querySelectorAll("h1");
	const h1Count = h1s.length;
	const h1Text = h1s.length > 0 ? h1s[0].textContent.trim() : null;
	checks.push({
		name: "single-h1",
		passed: h1Count === 1,
		value: h1Text,
		detail: "<h1> " + h1Count + "개 발견 (정확히 1개 권장)",
	});

	// 4. 모든 <img>에 alt
	const imgs = Array.from(document.querySelectorAll("img"));
	const missingAlt = imgs.filter(function(img) {
		return !img.hasAttribute("alt") || img.alt.trim() === "";
	}).length;
	checks.push({
		name: "img-alt",
		passed: imgs.length === 0 || missingAlt === 0,
		value: imgs.length + "개 이미지 중 " + missingAlt + "개 alt 누락",
		detail: missingAlt > 0
			? missingAlt + "개 이미지에 alt 속성 없음"
			: "모든 이미지에 alt 속성 있음",
	});

	// 5. og:title + og:image
	const ogTitleEl = document.querySelector('meta[property="og:title"]');
	const ogTitle = ogTitleEl ? ogTitleEl.content.trim() : null;
	const ogImageEl = document.querySelector('meta[property="og:image"]');
	const ogImage = ogImageEl ? ogImageEl.content.trim() : null;
	checks.push({
		name: "open-graph",
		passed: !!ogTitle && !!ogImage,
		value: "og:title=" + (ogTitle || "없음") + ", og:image=" + (ogImage ? "있음" : "없음"),
		detail: !ogTitle ? "og:title 없음" : !ogImage ? "og:image 없음" : "Open Graph 태그 정상",
	});

	// 6. <link rel="canonical">
	const canonicalEl = document.querySelector('link[rel="canonical"]');
	const canonical = canonicalEl ? canonicalEl.href : null;
	checks.push({
		name: "canonical",
		passed: !!canonical,
		value: canonical,
		detail: canonical ? "canonical: " + canonical : '<link rel="canonical"> 없음',
	});

	// 7. <meta name="viewport">
	const vpEl = document.querySelector('meta[name="viewport"]');
	const viewport = vpEl ? vpEl.content.trim() : null;
	checks.push({
		name: "viewport",
		passed: !!viewport,
		value: viewport,
		detail: viewport ? "viewport: " + viewport : '<meta name="viewport"> 없음',
	});

	// 8. <html lang>
	const lang = document.documentElement.getAttribute("lang");
	const langVal = lang ? lang.trim() : null;
	checks.push({
		name: "html-lang",
		passed: !!langVal,
		value: langVal,
		detail: langVal ? 'lang="' + langVal + '"' : "<html>에 lang 속성 없음",
	});

	return checks;
})()`;

export function createAuditSeoTool(browserBinding: unknown, files: R2Bucket) {
	return tool({
		title: "auditSeo",
		description:
			"Visit a URL and run 8 SEO checks (title, meta description, h1, img alt, Open Graph, canonical, viewport, html lang). Returns a 100-point score, check results, and an R2 screenshot filename (seo/*.jpeg). Opens the browser, audits, then closes it immediately.",
		inputSchema: z.object({
			url: z.url().meta({
				description: "The URL of the page to audit (https:// included)",
			}),
		}),
		execute: async ({ url }): Promise<SeoAuditResult | { error: string }> => {
			let browser;
			try {
				browser = await puppeteer.launch(
					browserBinding as Parameters<typeof puppeteer.launch>[0],
				);
				const page = await browser.newPage();
				await page.setViewport({ width: 1280, height: 720 });

				await page.goto(url, {
					waitUntil: "networkidle2",
					timeout: 30_000,
				});

				const checks = (await page.evaluate(
					SEO_CHECK_SCRIPT,
				)) as SeoCheckResult[];

				const passedCount = checks.filter((c) => c.passed).length;
				const score = passedCount * 12.5;

				const buffer = await page.screenshot({ type: "jpeg" });
				const filename = `seo/${Date.now()}.jpeg`;
				await files.put(filename, buffer, {
					httpMetadata: {
						contentType: "image/jpeg",
					},
				});

				return { url, checks, score, filename };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				console.error("[auditSeo] error:", message);
				return { error: `SEO audit failed: ${message}` };
			} finally {
				await browser?.close().catch(() => {});
			}
		},
	});
}
