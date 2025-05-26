import fs from 'fs';
import {promises as dns} from 'dns';
import net from 'net';
import {URL} from 'url';
import {crawlUrl} from "./crawler.js";

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

const checkedDomains = new Set();

async function processFile() {
    const data = fs.readFileSync(inputFile, 'utf8');
    const lines = data.split(/\r?\n/).filter(Boolean);

    const writeStream = fs.createWriteStream(outputFile, {encoding: 'utf8'});
    writeStream.write('\uFEFF');
    writeStream.write('Nombre de la empresa;URL de la web;Accesible;Emails de contacto;Emails de terceros\n');

    let index = 0;

    async function runTask(idx) {
        const cols = lines[idx].split(';');
        const name = cols[0];
        const url = cols[1] || '';
        let domain = '';
        try {
            domain = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
        } catch {}

        if (checkedDomains.has(domain)) return;

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
        checkedDomains.add(domain);
        return [name, domain, httpsStatus, hostEmails, thirdPartyEmails].join(';');
    }

    for (let i = 0; lines.length > index++; i++) {
        try {
            const result = await runTask(i);
            if(result){
                writeStream.write(result + '\n');
            }
        } catch (error) {
            console.error('Error on task:', error)
        }
    }
    writeStream.on('finish', () => console.log('Done'));

    writeStream.end();
}

processFile().catch(err => console.error('Error:', err));
