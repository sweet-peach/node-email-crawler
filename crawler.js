import {HttpCrawler, log} from 'crawlee';
import {promises as dns} from "dns";
import {config} from "./config.js";

let emailSet = new Set();

function extractEmails(text) {
    const pattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const matches = text.match(pattern);
    if (matches) {
        for (const email of matches) {
            emailSet.add(email.toLowerCase());
        }
    }
}

const crawler = new HttpCrawler({
    maxConcurrency: config.MAX_CONCURRENCY,
    minConcurrency: 10,
    requestHandlerTimeoutSecs: 60,
    autoscaledPoolOptions: { autoscaleIntervalSecs: 5 },
    maxRequestsPerCrawl: 10000,
    respectRobotsTxtFile: true,
    async requestHandler({request, $, body, enqueueLinks}) {
        const html = body.toString();
        extractEmails(html);
        if(!html) return;
        await enqueueLinks({ html, strategy: 'same-domain' });
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