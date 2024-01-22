import { load, CheerioAPI } from 'cheerio';
import iconv from 'iconv-lite';
import { PrismaClient } from '@prisma/client';
const { decode: iconv_decode } = iconv;

type RaceHorseRecord = {
    race_code: string,
    result: number,
    number: number,
    horse_id: string,
    horse_name: string,
    sex_age: string,
    carry_weight: string,
    jockey_id: string,
    time: string,
    progress: string,
    last_time: number,
    win_odds: number,
    favorite: number,
    horse_weight: number,
    horse_weight_diff: string,
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


const convertToUTF8 = async (res: Response) => {
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    const utf8 = iconv_decode(buf, 'euc-jp');
    return utf8;
}

const parseLinks = async (res: Response) => {
    const $ = load(await convertToUTF8(res));

    const allLinks = $('table > tbody > tr > td > a').map((i, a) => $(a).attr('href')).toArray();
    const raceLinks = allLinks.filter(link => /\/race\/\d+/.exec(link));
    return raceLinks;
}

const parseRaceRecord = async ($: CheerioAPI, link: string) => {
    const race = $('.data_intro > dl > dd');
    const race_name = race.children('h1').text();
    const race_info = race.children('p').text().split('/').map((v: string) => v.trim());
    const race_date_place = $('.data_intro > p.smalltxt').text().split(' ');

    return <RaceRecord>{
        code: link.split('/')[2],
        name: race_name,
        date: race_date_place[0].replace('年', '/').replace('月', '/').replace('日', ''),
        place: race_date_place[1].match(/\d回(.+)\d日目/)?.[1] || '',
        distance: race_info[0].match(/(\d+m)/)?.[1] || 0,
        course: race_info[0].match(/([^\d]+)\d+m/)?.[1] || '',
        weather: race_info[1].split(':')[1].trim() || '',
        condition: race_info[2].split(':')[1].trim() || '',
        time: race_info[3].split(':').slice(1).join(':').trim() || '',
    };
}

const parseRaceHorseRecord = async ($: CheerioAPI, race_id: string) => {
    const race_result_table = $('#contents_liquid > table > tbody');
    const trs = race_result_table.children('tr').toArray().slice(1);

    return trs.map((tr, i) => {
        const tds = $(tr).children('td').toArray();

        return <RaceHorseRecord> {
            race_code: race_id,
            result: Number($(tds[0]).text()),
            number: Number($(tds[2]).text()),
            horse_id: $(tds[3]).children('a').attr('href')?.split('/')[2] || "",
            horse_name: $(tds[3]).text().trim(),
            sex_age: $(tds[4]).text(),
            carry_weight: $(tds[5]).text(),
            jockey_id: $(tds[6]).children('a').attr('href')?.split('/')[4] || "",
            time: $(tds[7]).text(),
            progress: $(tds[10]).text(),
            last_time: Number($(tds[11]).text()),
            win_odds: Number($(tds[12]).text()),
            favorite: Number($(tds[13]).text()),
            horse_weight: Number($(tds[14]).text().match(/^(\d+)\(/)?.[1]) || 0,
            horse_weight_diff: $(tds[14]).text().match(/^\d+\(([+-]*\d+)\)/)?.[1],
        }
    })

}

const parseRace = async (res: Response, link: string) => {
    const $ = load(await convertToUTF8(res));
    const raceRecord = await parseRaceRecord($, link);
    const raceHorseRecords = await parseRaceHorseRecord($, raceRecord.code);
    return {
        raceRecord,
        raceHorseRecords
    }
}

const fetchRaceLinks = async (url: string) => {
    const res = await fetch(url);
    const raceLinks = await parseLinks(res);
    return raceLinks;
}

const initPrisma = async () => {
    const prisma = new PrismaClient({log: [
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
    ]});
    return prisma;
}

const fetchRace = async (base: string, link: string) => {
    const resRace = await fetch(base + link);
    const raceData = await parseRace(resRace, link);
    return raceData;
}

export const main = async () => {
    const base = 'https://db.netkeiba.com';
    const url = base + '/?pid=race_list&word=&start_year=none&start_mon=none&end_year=none&end_mon=none&jyo%5B%5D=01&jyo%5B%5D=02&jyo%5B%5D=03&jyo%5B%5D=04&jyo%5B%5D=05&jyo%5B%5D=06&jyo%5B%5D=07&jyo%5B%5D=08&jyo%5B%5D=09&jyo%5B%5D=10&grade%5B%5D=8&kyori_min=&kyori_max=&sort=date&list=100';

    const raceLinks = await fetchRaceLinks(url);
    const prisma = await initPrisma();

    console.log(raceLinks.length);

    for(const link of raceLinks) {
        const raceData = await fetchRace(base, link);

        // console.log(raceData);
        console.log(raceData.raceRecord.code);

        if(true) {
            const race_found = await prisma.race.findFirst({
                where: {
                    code: raceData.raceRecord.code
                }
            }).catch(e => {
                console.log(e);
            });

            console.log(`race found: ${race_found?.code}`);

            if(race_found) {
                console.log('race already exists');
                continue;
            }
        }

        const data = {
            ...raceData.raceRecord,
        };

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
            data: raceData.raceHorseRecords as unknown
        })
    }
}

