import {CheerioCrawler, log} from 'crawlee';
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

const crawler = new CheerioCrawler({
    maxConcurrency: config.MAX_CONCURRENCY,
    requestHandlerTimeoutSecs: 60,
    maxRequestsPerCrawl: 10000,
    respectRobotsTxtFile: true,
    async requestHandler({request, $, body, enqueueLinks}) {
        log.info(`Processing: ${request.loadedUrl || request.url}`);

        const text = $ ? $.text() : body;
        extractEmails(text);

        await enqueueLinks({strategy: 'same-domain'});
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

    await crawler.run([startUrl]);

    const siteHost = new URL(startUrl).hostname.replace(/^www\./, '').toLowerCase();
    const hostEmails = [];
    const thirdPartyEmails = [];

    for (const email of emailSet) {
        const domain = email.split('@')[1];
        if (!(await checkMailService(domain))) continue;          // skip dead domains

        const root = domain.replace(/^www\./, '').toLowerCase();
        if (root === siteHost || root.endsWith('.' + siteHost)) {
            hostEmails.push(email);
        } else {
            thirdPartyEmails.push(email);
        }
    }

    return [hostEmails, thirdPartyEmails];
}