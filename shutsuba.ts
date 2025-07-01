import { launch, type Page } from 'puppeteer';
import type { RaceHorseRecordColumn, HorseResultColumn, HorseRaceResult, HorseRaceResultWithRank } from './index.d';
import { writeFileSync } from 'fs';
import { putsCsv } from './showcsv';

const sleep = (time: number) => new Promise((r) => setTimeout(r, time));

function formatNumberToTwoDecimals(num: number): string {
    return num.toFixed(2);
}

function filterRecentResults(results: RaceHorseRecordColumn[], raceDate?: string): RaceHorseRecordColumn[] {
    const today = raceDate === undefined ? new Date() : new Date(raceDate);
    const twoYearsAgo = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate());

    return results.filter(result => {
        const raceDate = new Date(result.date);
        return result.lastTime && raceDate >= twoYearsAgo;
    });
}

function calcRaceTimeIndex(results: RaceHorseRecordColumn[]): string {
    const validResults = results.filter(result => result.raceTime && result.raceDistance);
    if (validResults.length === 0) return '';

    const indices = validResults.map(result => {
        const [minutes, seconds] = result.raceTime.split(':').map(Number);
        const totalSeconds = minutes * 60 + seconds;

        const distance = Number(result.raceDistance.replace(/[^0-9]/g, ''));

        return totalSeconds / distance * 1000;
    });

    const average = indices.reduce((a, b) => a + b, 0) / indices.length;
    return formatNumberToTwoDecimals(average);
}

async function calcAverageLastTime(raceHorseRecordColumns: RaceHorseRecordColumn[]) {
    const lastTimes = raceHorseRecordColumns.filter(r => r.lastTime !== '').map(r => Number(r.lastTime));
    const sum = lastTimes.reduce((a, b) => a + b, 0);
    return sum / lastTimes.length;
}

async function fetchHorsePage(page: Page, url: string) {
    await page.goto(url);
    const raceResults = await page.$$('table.db_h_race_results tbody tr');
    return Promise.all(raceResults.map(async (raceResult) => {
        const tds = await raceResult.$$('td');
        const getValue = async (n: number) => {
            const e = await tds[n].toElement('td');
            const p = await e.getProperty('textContent');
            const v = await p.jsonValue();
            return v ? (v as string).trim() : '';
        }
        return {
            date: await getValue(0), // 日付
            course: await getValue(1), // 開催
            weather: await getValue(2), // 天気
            raceNum: await getValue(3), // R
            raceName: await getValue(4), // レース名
            // 映像P
            raceHorseNum: await getValue(6), // 頭数
            // 枠番
            horseGateNum: await getValue(8), // 馬番
            // オッズ
            favorite: await getValue(10), // 人気
            result: await getValue(11),
            jockey: await getValue(12),
            handicap: await getValue(13),
            raceDistance: await getValue(14),
            raceCondition: await getValue(15),
            raceTime: await getValue(17),
            passage: await getValue(20),
            racePace: await getValue(21),
            lastTime: await getValue(22),
            weight: await getValue(23),
        };
    }));
}

async function findHorseList(page: Page) {
    const links = await page.$$('table.Shutuba_Table tbody td.HorseInfo a');
    const horses = links.map(async (link) => {
        const a = await link.toElement('a');
        return {
            horseId: await (await a.getProperty('href')).jsonValue(),
            horseName: await (await a.getProperty('textContent')).jsonValue()
        };
    });

    console.log(horses.length);

    return Promise.all(horses);
}

async function findRaceDate(page: Page) {
    const dateElm = await page.$('div.data_intro p.smalltxt');
    const dateText = (await (await dateElm.getProperty('textContent')).jsonValue()).split(' ').shift();
    const result = dateText?.replace('年', '-').replace('月', '-').replace('日', '');
    return result;
}

async function findRaceName(page:Page) {
    const raceNameElm = await page.$('h1.RaceName');
    const raceName = await raceNameElm?.evaluate(e => e.textContent.trim());
    console.log(raceName);
    return raceName;
}

async function fetchRacePage(url: string): Promise<{raceName: string, results: HorseRaceResult[]}> {
    const browser = await launch({ headless: true, browser: 'firefox' });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0); 
    await page.goto(url);
    const raceName = await findRaceName(page) ?? '';
    const horses = await findHorseList(page);
    const results: HorseRaceResult[] = [];
    for (const horse of horses) {
        console.log(`Start: ${horse.horseName}:${horse.horseId}`);
        const horsePage = await fetchHorsePage(page, horse.horseId);
        console.log(`Page fetched`);
        const recentResults = filterRecentResults(horsePage);
        console.log(`Filter Page`);
        const averageLastTime = await calcAverageLastTime(recentResults);
        results.push({
            horseId: horse.horseId,
            horseName: horse.horseName,
            averageLastTime: formatNumberToTwoDecimals(averageLastTime),
            raceTimeIndex: calcRaceTimeIndex(recentResults),
            results: recentResults
        });
        console.log(`Fetched ${horse.horseName}`);
        await sleep(1000);
    }

    await browser.close();
    return {raceName, results};
}

async function findRaceNameForDB(page: Page) {
  const raceNameElm = await page.$('div.data_intro h1');
  const raceName = (await (await raceNameElm.getProperty('textContent')).jsonValue()).trim();
  console.log(raceName);
  return raceName;
}

async function findHorseListForDB(page: Page) {
    const links = await page.$$('table.race_table_01 tbody td a');
    const horses = links.map(async (link) => {
        const a = await link.toElement('a');
        const href = await (await a.getProperty('href')).jsonValue();
        const text = await (await a.getProperty('textContent')).jsonValue();
        return href.includes('/horse/') ? {
            horseId: href,
            horseName: text
        } : null;
    });

  const result = (await Promise.all(horses)).filter((v) => v !== null);
    console.log(result.length);

    return result
}

async function fetchRacePage_backtest(url: string) {
    const browser = await launch({ headless: true, browser: 'firefox' });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0); 
    await page.goto(url);
  
    const raceDate = await findRaceDate(page);
    const raceName = await findRaceNameForDB(page) ?? '';
    const horses = await findHorseListForDB(page);
    const results: HorseRaceResult[] = [];
    for (const horse of horses) {
        console.log(`Start: ${horse.horseName}:${horse.horseId}`);
        const horsePage = await fetchHorsePage(page, horse.horseId);
        console.log(`Page fetched`);
        const recentResults = filterRecentResults(horsePage, raceDate);
        console.log(`Filter Page`);
        const averageLastTime = await calcAverageLastTime(recentResults);
        results.push({
            horseId: horse.horseId,
            horseName: horse.horseName,
            averageLastTime: formatNumberToTwoDecimals(averageLastTime),
            raceTimeIndex: calcRaceTimeIndex(recentResults),
            results: recentResults
        });
        console.log(`Fetched ${horse.horseName}`);
        await sleep(1000);
    }

    await browser.close();
    return {raceName, results};
}

function sortResultByLastTime(results: HorseRaceResult[]):Partial<HorseRaceResult>[]
{
    return results
        .sort((a, b) => Number(a.averageLastTime) - Number(b.averageLastTime))
        .map(r => ({
            horseId: r.horseId,
            horseName: r.horseName,
            averageLastTime: r.averageLastTime
        }));
} 

function sortResultByRaceTimeIndex(results: HorseRaceResult[]): Partial<HorseRaceResult>[]
{
    return results
        .sort((a, b) => Number(a.raceTimeIndex) - Number(b.raceTimeIndex))
        .map(r => ({
            horseId: r.horseId,
            horseName: r.horseName,
            raceTimeIndex: r.raceTimeIndex
        }));
}

function sortResultByRank(
    result: HorseRaceResult[], 
    sortByLastTime: Partial<HorseRaceResult>[],
    sortByIndex: Partial<HorseRaceResult>[]
): HorseRaceResultWithRank[] {
    return result.map((r) => {
        const lastTimeRank = sortByLastTime.findIndex(o => o.horseId === r.horseId) + 1;
        const indexRank = sortByIndex.findIndex(o => o.horseId === r.horseId) + 1;

        return {
            horseId: r.horseId,
            horseName: r.horseName,
            averageLastTime: r.averageLastTime,
            raceTimeIndex: r.raceTimeIndex,
            lastTimeRank,
            indexRank,
            rank: Number(lastTimeRank) ** 2 + Number(indexRank) ** 2
        };
    })
    .sort((a, b) => a.rank - b.rank);
}

export async function main(race_id: string) {
    const base = 'https://race.netkeiba.com/race/shutuba.html';
    const params = {
        race_id,
        rf: 'race_list'
    };
    const searchParams = new URLSearchParams(params);
    const url = `${base}?${searchParams.toString()}`;
    console.log(url);

    const {raceName, results} = await fetchRacePage(url);
    const sortByLastTime = sortResultByLastTime(results);
    const sortByIndex = sortResultByRaceTimeIndex(results);
    const withRanking = sortResultByRank(results, sortByLastTime, sortByIndex);
    const csvContent = toCsv(withRanking);

    saveResult(`${race_id}${raceName}`, csvContent);
    putsCsv(csvContent);
}

export async function backtest(race_id: string) {
    const url = `https://db.netkeiba.com/race/${race_id}/`;
    console.log(url);

    const { raceName, results } = await fetchRacePage_backtest(url);
    if(results === undefined) return;
    const sortByLastTime = sortResultByLastTime(results);
    const sortByIndex = sortResultByRaceTimeIndex(results);
    const withRanking = sortResultByRank(results, sortByLastTime, sortByIndex);
    const csvContent = toCsv(withRanking);

    saveResult(`${race_id}${raceName}`, csvContent);
    putsCsv(csvContent);
}

function toCsv(ary: HorseResultColumn[]): string {
    const headers = ['horseId', 'horseName', 'averageLastTime', 'raceTimeIndex', 'lastTimeRank', 'indexRank', 'rank'];
    const rows = ary.map(result => headers.map(header => result[header as keyof HorseResultColumn]));

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');
    return csvContent;
}

function saveResult(raceId: string, csvContent: string): void {
    writeFileSync(`${raceId}.csv`, csvContent);
    console.log(`Results saved to ${raceId}.csv`);
}

export { 
    formatNumberToTwoDecimals,
    filterRecentResults,
    calcRaceTimeIndex,
    calcAverageLastTime,
    fetchHorsePage,
    findHorseList,
    fetchRacePage,
    toCsv,
    saveResult
}
