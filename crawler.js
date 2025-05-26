import {CheerioCrawler, log} from 'crawlee';
import {promises as dns} from "dns";
import {config} from "./config.js";

let emailSet = new Set();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const COMMON_INCLUDE = [
    '**/*.html', '**/*.htm', '**/',
    '**/*.php', '**/*.asp', '**/*.aspx', '**/*.jsp',
    '**/contact*', '**/about*', '**/team*', '**/staff*',
    '**/aviso*', '**/legal*', '**/privacy*', '**/politica*',
    '**/blog/**', '**/news/**'
];

const MAX_BLOCKED = 10;

const COMMON_EXCLUDE = [
    '**/*.jpg', '**/*.jpeg', '**/*.png', '**/*.gif', '**/*.svg', '**/*.webp',
    '**/*.ico', '**/*.bmp', '**/*.tif', '**/*.tiff', '**/*.psd', '**/*.ai',
    '**/*.eps', '**/*.heic', '**/*.heif',
    '**/*.css', '**/*.scss', '**/*.less',
    '**/*.woff', '**/*.woff2', '**/*.ttf', '**/*.otf', '**/*.eot',
    '**/*.js', '**/*.mjs', '**/*.ts',
    '**/*.json', '**/*.geojson', '**/*.wasm',
    '**/*.mp4', '**/*.m4v', '**/*.mov', '**/*.avi', '**/*.wmv',
    '**/*.flv', '**/*.mkv', '**/*.webm', '**/*.mpeg', '**/*.mpg',
    '**/*.mp3', '**/*.m4a', '**/*.wav', '**/*.flac', '**/*.ogg', '**/*.oga',
    '**/*.pdf', '**/*.doc', '**/*.docx', '**/*.xls', '**/*.xlsx',
    '**/*.ppt', '**/*.pptx', '**/*.odt', '**/*.ods', '**/*.odp', '**/*.rtf',
    '**/*.zip', '**/*.rar', '**/*.7z', '**/*.tar', '**/*.tgz',
    '**/*.tar.gz', '**/*.bz2', '**/*.gz', '**/*.xz',
    '**/*.dmg', '**/*.iso', '**/*.exe', '**/*.msi', '**/*.bin',
    '**/*.swf', '**/*.class', '**/*.jar'
];

function extractEmails(text ){
    const pattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

    const matches = text
        .replace(/\\[rn]/g, ' ')
        .match(pattern);

    if (matches) {
        for (const email of matches) {
            emailSet.add(email.toLowerCase());
        }
    }
}

function extractEmailsFromMailto($) {
    $('a[href^="mailto:"]').each((_, el) => {
        const raw = $(el).attr('href');
        if (!raw) return;

        const email = raw.replace(/^mailto:/i, '').split('?')[0];
        if (email) emailSet.add(email.toLowerCase());
    });
}

let blockedRequests = 0;

const crawler = new CheerioCrawler({
    maxConcurrency: config.MAX_CONCURRENCY,
    minConcurrency: 2,
    requestHandlerTimeoutSecs: 60,
    autoscaledPoolOptions: {autoscaleIntervalSecs: 5},
    maxRequestsPerCrawl: 100,
    respectRobotsTxtFile: true,
    ignoreSslErrors: true,
    additionalMimeTypes: ['application/rss+xml'],
    async requestHandler({request, $, body, enqueueLinks}) {

        const text = body.toString();
        extractEmails(text);
        if($) extractEmailsFromMailto($);
        // TODO Check for malitos and add them to list

        await enqueueLinks(
            {
                strategy: 'same-domain',
                globs: COMMON_INCLUDE,
                exclude: COMMON_EXCLUDE,
            });
    },
    failedRequestHandler({request, error}) {
        if (error?.message?.includes('403')) {
            blockedRequests++;
            if (blockedRequests >= MAX_BLOCKED) {
                log.error(`Too many blocked requests (${blockedRequests}). Aborting crawl for this site.`);
                return crawler.autoscaledPool.abort();
            }
        }

        log.warning(`${request.url} failed: ${error?.message ?? 'unknown error'}`);
    },
});

const workingDomains = new Map();

async function checkMailService(domain) {
    if (workingDomains.has(domain)) return workingDomains.get(domain);
    let ok = false;
    try {
        const mx = await dns.resolveMx(domain);
        ok = Array.isArray(mx) && mx.length > 0;
    } catch(e) {
        console.log(e);
    }
    workingDomains.set(domain, ok);
    console.log(`Domain mx ${domain} status ${ok}`);
    return ok;
}

export async function crawlUrl(startUrl) {
    emailSet = new Set();
    const siteHost = new URL(startUrl).hostname.replace(/^www\./, '').toLowerCase();
    log.info(`Processing: ${siteHost}`);
    blockedRequests = 0;
    await crawler.run([startUrl]);

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