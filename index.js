import fs from 'fs';
import {promises as dns} from 'dns';
import net from 'net';
import {crawlUrl} from "./crawler.js";
import {config} from "./config.js";
import {getUniqueLines} from "./cleaner.js";

const inputFile = './in.csv';
const outputFile = './out.csv'

const HTTPS_PORT = 443;
const CONNECTION_TIMEOUT = 5000;

function checkPort(host, port, timeout = CONNECTION_TIMEOUT) {
    return new Promise(resolve => {
        const socket = new net.Socket();
        let status = false;
        socket.setTimeout(timeout);
        socket.on('connect', () => {
            status = true;
            socket.destroy();
        });
        socket.on('timeout', () => socket.destroy());
        socket.on('error', () => {
        });
        socket.on('close', () => resolve(status));
        socket.connect(port, host);
    });
}

async function checkDomain(domain) {
    const result = {https: false, mail: false};
    result.https = await checkPort(domain, HTTPS_PORT);
    try {
        const mx = await dns.resolveMx(domain);
        if (mx.length) result.mail = true;
    } catch (e) {
    }
    return result;
}

async function runTask(name, domain) {
    let httpsStatus = false;
    if (domain) {
        const domRes = await checkDomain(domain);
        httpsStatus = domRes.https;
    }
    let hostEmails = [];
    let thirdPartyEmails = [];

    if (httpsStatus) {
        [hostEmails, thirdPartyEmails] = await crawlUrl(`https://${domain}`);
    }
    return [name, domain, httpsStatus, hostEmails, thirdPartyEmails].join(';');
}

async function main(){
    const data = fs.readFileSync(inputFile, 'utf8');
    const lines = data.split(/\r?\n/).filter(Boolean);

    const uniqueLines = getUniqueLines(lines);
    const out = fs.createWriteStream(outputFile, {encoding: 'utf8'});
    out.write('\uFEFF');
    out.write('Nombre de la empresa;URL de la web;Accesible;Emails de contacto;Emails de terceros\n');
    for (let i = 0; i < uniqueLines.length; i += config.MAX_ACTIVE_CRAWLERS) {
        const batch = uniqueLines.slice(i, i + config.MAX_ACTIVE_CRAWLERS);

        const results = await Promise.all(batch.map(([name, domain]) => runTask(name, domain)));

        for (const res of results) if (res) out.write(res + '\n');
    }

    out.end(() => console.log('Done'));
}

main();
