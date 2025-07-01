import { readFileSync } from 'fs';

export function putsCsv(str: string) {
    const lines = str.split('\n');

    const arr = lines.map(line => line.split(','));

    const fmt = arr.map(row => {
      const matched = row[0].toString().match(/\/horse\/([0-9]+)/);
      const id = matched !== null && matched.length == 2 ? matched[1] : '-';
        return [
            id,
            row[1].toString().padEnd(9, '　'),
            row[2],
            row[3],
            row[4].toString().padStart(2, ' '),
            row[5].toString().padStart(2, ' '),
            row[6].toString().padStart(3, ' ')
        ].join('\t');
    });

    console.log(fmt.join('\n'));
}

// このファイルが直接実行された場合のみ実行
if (import.meta.url === `file://${process.argv[1]}`) {
    const file = Bun.argv[2];
    const csv = readFileSync(file);
    putsCsv(csv.toString());
}
