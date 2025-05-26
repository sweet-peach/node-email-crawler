import {CheerioCrawler, log} from 'crawlee';
import {promises as dns} from "dns";
import {config} from "./config.js";

let emailSet = new Set();

const COMMON_INCLUDE = [
    '**/*.html', '**/*.htm', '**/',
    '**/*.php', '**/*.asp', '**/*.aspx', '**/*.jsp',
    '**/contact*', '**/about*', '**/team*', '**/staff*',
    '**/aviso*', '**/legal*', '**/privacy*', '**/politica*',
    '**/blog/**', '**/news/**'
];

const COMMON_EXCLUDE = [
    '**/*.jpg', '**/*.jpeg', '**/*.png', '**/*.gif', '**/*.svg', '**/*.webp', '**/*.ico',
    '**/*.css', '**/*.js', '**/*.woff*', '**/*.ttf', '**/*.eot',
    '**/*.mp4', '**/*.mp3', '**/*.avi', '**/*.zip', '**/*.rar', '**/*.7z', '**/*.tar', '**/*.gz'
];

function extractEmails(text) {
    const pattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const matches = text.match(pattern);
    if (matches) {
        for (const email of matches) {
            emailSet.add(email.toLowerCase());
        }
    }
}

const crawler = new CheerioCrawler({
    maxConcurrency: config.MAX_CONCURRENCY,
    minConcurrency: 10,
    requestHandlerTimeoutSecs: 60,
    autoscaledPoolOptions: {autoscaleIntervalSecs: 5},
    maxRequestsPerCrawl: 10000,
    respectRobotsTxtFile: true,
    async requestHandler({request, $, body, enqueueLinks}) {
        log.info(`Processing: ${request.loadedUrl || request.url}`);
        if (request.headers['content-type']?.includes('text/html')) {
            return;
        }

        const text = $ ? $.text() : body;
        extractEmails(text);


        await enqueueLinks(
            {
                strategy: 'same-domain',
                globs: COMMON_INCLUDE,
                exclude: COMMON_EXCLUDE,
            });
    },
    failedRequestHandler({request, error}) {
        log.warning(`❌  ${request.url} failed: ${error?.message ?? 'unknown error'}`);
    },
});

const workingDomains = new Map();

async function checkMailService(domain) {
    if (workingDomains.has(domain)) return workingDomains.get(domain);
    let ok = false;
    try {
        const mx = await dns.resolveMx(domain);
        ok = Array.isArray(mx) && mx.length > 0;
    } catch {
    }
    workingDomains.set(domain, ok);
    return ok;
}

export async function crawlUrl(startUrl) {
    emailSet = new Set();
    const siteHost = new URL(startUrl).hostname.replace(/^www\./, '').toLowerCase();
    log.info(`Crawling: ${siteHost}`);
    await crawler.run([startUrl]);
    log.info(`Done: ${siteHost}`);

    const hostEmails = [];
    const thirdPartyEmails = [];

    for (const email of emailSet) {
        const domain = email.split('@')[1];
        if (!(await checkMailService(domain))) continue;

        const root = domain.replace(/^www\./, '').toLowerCase();
        if (root === siteHost || root.endsWith('.' + siteHost)) {
            hostEmails.push(email);
        } else {
            thirdPartyEmails.push(email);
        }
    }
    return [hostEmails, thirdPartyEmails];
}