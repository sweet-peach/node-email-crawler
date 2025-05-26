import {URL} from "url";

const checkedDomains = new Set();

export function getUniqueLines(lines) {
    const uniqueLines = new Map();
    for (let i = 0; lines.length > i + 1; i++) {
        const line = lines[i];
        const columns = line.split(';');
        const name = columns[0];
        const url = columns[1] || '';

        let domain = '';
        try {
            domain = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
        } catch {
        }

        if (checkedDomains.has(domain)) {
            continue;
        }
        checkedDomains.add(domain);
        uniqueLines.set(name, domain);
    }

    return [...uniqueLines];
}