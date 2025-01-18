import { load, CheerioAPI } from 'cheerio';
import iconv from 'iconv-lite';
import { PrismaClient } from '@prisma/client';
const { decode: iconv_decode } = iconv;

type RaceHorseRecord = {
    raceCode: string,		// レースID
    result: number,		// 着順
    horseNum: number,		// 馬番
    horseId: string,		// 馬ID
    horseName: string,		// 馬名
    sexAge: string,		// 性齢
    carryWeight: string,	// 斤量
    jockeyId: string,		// ジョッキーID
    time: string,		// タイム
    progress: string,		// 通過
    lastTime: number,		// 上がり
    winOdds: number,		// 単勝オッズ
    favorite: number,		// 人気
    horseWeight: number,	// 馬体重
    horseWeightDiff: string,	// 馬体重前走差
}

type RaceRecord = {
    code: string,
    name: string,
    date: string,
    place: string,
    distance: string,
    course: string,
    weather: string,
    condition: string,
    time: string,
    // race_horse_records: RaceHorseRecord[],
}

async function convertToUTF8(ab: ArrayBuffer) {
    const buf = Buffer.from(ab);
    const utf8 = iconv_decode(buf, 'euc-jp');
    return utf8;
}

async function parseLinks(ab: ArrayBuffer) {
    const $ = load(await convertToUTF8(ab));

    const allLinks = $('table > tbody > tr > td > a').map((i, a) => $(a).attr('href')).toArray();
    const raceLinks = allLinks.filter(link => /\/race\/\d+/.exec(link));
    const nextPages = $('div.common_pager > ul > li > a').map((a) => $(a).attr('href')).toArray();

    console.log(nextPages);
    return raceLinks;
}

async function parseRaceRecord($: CheerioAPI, link: string): Promise<RaceRecord> {
    const race = $('.data_intro > dl > dd');
    const race_name = race.children('h1').text();
    const race_info = race.children('p').text().split('/').map((v: string) => v.trim());
    const race_date_place = $('.data_intro > p.smalltxt').text().split(' ');
    
    return {
        code: link.split('/')[2],
        name: race_name,
        date: race_date_place[0].replace('年', '/').replace('月', '/').replace('日', ''),
        place: race_date_place[1].match(/\d回(.+)\d日目/)?.[1] || '',
        distance: race_info[0].match(/(\d+m)/)?.[1] || '',
        course: race_info[0].match(/([^\d]+)\d+m/)?.[1] || '',
        weather: race_info[1].split(':')[1].trim() || '',
        condition: race_info[2].split(':')[1].trim() || '',
        time: race_info[3].split(':').slice(1).join(':').trim() || '',
    };
}

async function parseRaceHorseRecord($: CheerioAPI, race_id: string): Promise<RaceHorseRecord[]> {
    const race_result_table = $('#contents_liquid > table > tbody');
    const trs = race_result_table.children('tr').toArray().slice(1);

    return trs.map((tr, i) => {
        const tds = $(tr).children('td').toArray();

        return {
            raceCode: race_id,
            result: Number($(tds[0]).text()),
            horseNum: Number($(tds[2]).text()),
            horseId: $(tds[3]).children('a').attr('href')?.split('/')[2] || "",
            horseName: $(tds[3]).text().trim(),
            sexAge: $(tds[4]).text(),
            carryWeight: $(tds[5]).text(),
            jockeyId: $(tds[6]).children('a').attr('href')?.split('/')[4] || "",
            time: $(tds[7]).text(),
            progress: $(tds[10]).text(),
            lastTime: Number($(tds[11]).text()),
            winOdds: Number($(tds[12]).text()),
            favorite: Number($(tds[13]).text()),
            horseWeight: Number($(tds[14]).text().match(/^(\d+)\(/)?.[1]) || 0,
            horseWeightDiff: $(tds[14]).text().match(/^\d+\(([+-]*\d+)\)/)?.[1] || '',
        }
    })
}

async function parseRace(ab: ArrayBuffer, link: string) {
    const $ = load(await convertToUTF8(ab));
    const raceRecord = await parseRaceRecord($, link);
    const raceHorseRecords = await parseRaceHorseRecord($, raceRecord.code);
    return {
        raceRecord,
        raceHorseRecords
    }
}

async function fetchRaceLinks(url: string) {
    const res = await fetch(url);
    const raceLinks = await parseLinks(await res.arrayBuffer());
    return raceLinks;
}

export async function initPrisma() {
    const prisma = new PrismaClient({
        log: [
            {
                emit: 'stdout',
                level: 'query',
            },
            {
                emit: 'stdout',
                level: 'error',
            },
            {
                emit: 'stdout',
                level: 'info',
            },
            {
                emit: 'stdout',
                level: 'warn',
            },
        ]
    });
    return prisma;
}

async function fetchRace(base: string, link: string) {
    const resRace = await fetch(base + link);
    const raceData = await parseRace(await resRace.arrayBuffer(), link);
    return raceData;
}

export async function main() {
    const base = 'https://db.netkeiba.com/';
    const url = base + '?pid=race_list&word=&start_year=none&start_mon=none&end_year=none&end_mon=none&jyo%5B%5D=01&jyo%5B%5D=02&jyo%5B%5D=03&jyo%5B%5D=04&jyo%5B%5D=05&jyo%5B%5D=06&jyo%5B%5D=07&jyo%5B%5D=08&jyo%5B%5D=09&jyo%5B%5D=10&grade%5B%5D=8&kyori_min=&kyori_max=&sort=date&list=100';

    const raceLinks = await fetchRaceLinks(url);
    const prisma = await initPrisma();

    console.log(raceLinks.length);

    for (const link of raceLinks) {
        const raceData = await fetchRace(base, link);

        // console.log(raceData);
        console.log(raceData.raceRecord.code);

        if (false) {
            const race_found = await prisma.race.findFirst({
                where: {
                    code: raceData.raceRecord.code
                }
            }).catch(e => {
                console.log(e);
            });

            console.log(`race found: ${race_found?.code}`);

            if (race_found) {
                console.log('race already exists');
                continue;
            }
        }

        const data = {
            ...raceData.raceRecord,
        };

        const race_json = `data/${data.code}_race.json`;
        await Bun.write(race_json, JSON.stringify(data));
        const racehorse_json = `data/${data.code}_racehorse.json`;
        await Bun.write(racehorse_json, JSON.stringify(raceData.raceHorseRecords))

        if (false) {
            const race = await prisma.race.create({
                data
            }).then((v) => {
                console.log(`race ${v.code} created`);
                return v;
            }).catch(e => {
                console.log(e);
                return null;
            });

            const raceHorse = await prisma.raceHorse.createMany({
                data: raceData.raceHorseRecords
            });
        }
    }
}
