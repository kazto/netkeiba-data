import { load, CheerioAPI } from 'cheerio';
// import { html } from 'cheerio/static';
import { PrismaClient } from '@prisma/client';
import { convertToUTF8 } from 'convertToUTF8';
import type { RaceHorseRecord, RaceRecord } from './index.d';

async function parseLinks(ab: ArrayBuffer) {
    const $ = load(await convertToUTF8(ab));

    const allLinks = $('table > tbody > tr > td > a').map((i, a) => $(a).attr('href')).toArray();
    const raceLinks = allLinks.filter(link => /\/race\/\d+/.exec(link));
    const nextPages = $('div.common_pager > ul > li > a').map((i, a) => $(a).attr('href')).toArray();

    return { raceLinks, nextPages };
}

async function parseRaceRecord($: CheerioAPI, link: string): Promise<RaceRecord> {
    const race = $('.data_intro > dl > dd');
    const race_info = race.children('p').text().split('/').map((v: string) => v.trim());
    // const race_date_place = $('.data_intro > p.smalltxt').text().split(' ');
    // const tmp = $('div.data_intro > p.smalltxt').text();
    const tmp = $('.data_intro > p.smalltxt').text();
    const race_date_place = tmp.split(' ')
    if(race_date_place.length < 2) {
	Bun.write('error.html', $.html());
	throw new Error(`link: https://db.netkeiba.com${link} , tmp: "${tmp}"`);
    }

    const code = link.split('/')[2];
    const name = race.children('h1').text();
    const date = race_date_place[0].replace('年', '/').replace('月', '/').replace('日', '');
    const distance_s = race_info[0].match(/(\d+)m/)?.[1];
    const distance = distance_s ? Number(distance_s) : undefined;
    const place = race_date_place[1].match(/\d+回(.+)\d+日目/)?.[1] || '';
    const course = race_info[0].match(/([^\d]+)\d+m/)?.[1] || '';
    const weather = race_info[1].split(':')[1].trim() || '';
    const condition = race_info[2].split(':')[1].trim() || '';
    const time = race_info[3].split(':').slice(1).join(':').trim() || '';

    return {
        code,
        name,
        date,
        place,
        distance,
        course,
        weather,
        condition,
        time
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
            horseWeight: Number($(tds[14]).text().match(/^(\d+)\(/)?.[1]),
            horseWeightDiff: $(tds[14]).text().match(/^\d+\(([+-]*\d+)\)/)?.[1] || "",
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
    return await parseLinks(await res.arrayBuffer());
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

export async function main(year: number) {
    const base = 'https://db.netkeiba.com/';
    const params = {
        pid: 'race_list',
        word: '',
        start_year: year.toString(),
        start_mon: '1',
        end_year: year.toString(),
        end_mon: '12',
        kyori_min: '',
        kyori_max: '',
        sort: 'date',
        list: '100'
    }
    const params_jyo = ['01','02','03','04','05','06','07','08','09','10'];
    const params_grade = ['8'];
    const searchParams = new URLSearchParams(params);
    for (const v of params_jyo) {
    	searchParams.append(`jyo[]`, v)
    }
    for (const v of params_grade) {
	    searchParams.append(`grade[]`, v)
    }
    const url = `${base}?${searchParams.toString()}`;
    console.log(url);

    const { raceLinks, nextPages } = await fetchRaceLinks(url);
    const urls = [...new Set(nextPages)];
    const links = [raceLinks];
    for(const u of urls) {
        const ls = await fetchRaceLinks(u);
        links.push(ls.raceLinks);
    }
    const flatLinks = links.flatMap(n => n);
    
    const prisma = await initPrisma();

    console.log(raceLinks.length);

    for (const link of flatLinks) {
	    await Bun.sleep(500);
	
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
        const race_fh = Bun.file(race_json);
        if (await race_fh.exists()) {
            console.log(`exists: ${race_json}`);
        }
        else {
            await Bun.write(race_fh, JSON.stringify(data));
            console.log(`write: ${race_json}`);
        }

        const racehorse_json = `data/${data.code}_racehorse.json`;
        const racehorse_fh = Bun.file(racehorse_json);
        if (await racehorse_fh.exists()) {
            console.log(`exists: ${racehorse_json}`);
        }
        else {
            await Bun.write(racehorse_fh, JSON.stringify(raceData.raceHorseRecords))
            console.log(`write: ${racehorse_json}`);
        }

        // if (false) {
        //     const race = await prisma.race.create({
        //         data
        //     }).then((v) => {
        //         console.log(`race ${v.code} created`);
        //         return v;
        //     }).catch(e => {
        //         console.log(e);
        //         return null;
        //     });

        //     const raceHorse = await prisma.raceHorse.createMany({
        //         data: raceData.raceHorseRecords
        //     });
        // }
    }
}