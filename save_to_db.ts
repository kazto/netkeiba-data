import { PrismaClient } from '@prisma/client';
import { initPrisma } from './shinbasen';
import { Glob } from 'bun';

async function notExistRace(prisma, code: string): boolean {
    const found = await prisma.race.findFirst({ where: { code }}).catch(e => {
        console.log(e);
    });
    return found === null;
}

async function writeRaceData(prisma, glob) {
    for await (const f of glob.scan('.')) {
	const data = await Bun.file(f).json();
	const notFound = await notExistRace(prisma, data.code);
	console.log(notFound);

	if(notFound) {
	    await prisma.race.create({data});
	    console.log(`write: ${data.code}`);
	}
	else {
	    console.log(`exist: ${data.code}`);
	}
    }    
}

async function writeRaceHorseData(prisma, glob) {
    for await (const f of glob.scan('.')) {
	const data = await Bun.file(f).json();

	try {
	    const { count } = await prisma.raceHorse.createMany({data, skipDuplicates: true});
	    console.log(`input: ${data.length}, save: ${count}`)
	}
	catch(e) {
	    console.log(e);
	}
    }    
}

async function globRaceFile(prisma) {
    const g = new Glob('data/*_race.json');
    await writeRaceData(prisma, g);
}

async function globRaceHorseFile(prisma) {
    const g = new Glob('data/*_racehorse.json');
    await writeRaceHorseData(prisma, g);
}

export async function saveToDb() {
    const prisma = await initPrisma();
    // console.log(prisma);

    await globRaceFile(prisma);
    await globRaceHorseFile(prisma);
}

await saveToDb();
