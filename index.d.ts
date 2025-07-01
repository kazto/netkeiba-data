export type RaceHorseRecord = {
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

export type RaceRecord = {
    code: string,
    name: string,
    date: string,
    place: string,
    distance?: number,
    course: string,
    weather: string,
    condition: string,
    time: string,
    // race_horse_records: RaceHorseRecord[],
}

export type RaceHorseRecordColumn = {
    date: string,
    course: string,
    weather: string,
    raceNum: string,
    raceName: string,
    raceHorseNum: string,
    horseGateNum: string,
    favorite: string,
    result: string,
    jockey: string,
    handicap: string,
    raceDistance: string,
    raceCondition: string,
    raceTime: string,
    passage: string,
    racePace: string,
    lastTime: string,
    weight: string,
}

export type HorseRecord = {
    horseId: string,
    horseName: string,
    results: RaceHorseRecordColumn[],
}

export type HorseResultColumn = {
    horseId: string,
    horseName: string,
    averageLastTime: string,
    raceTimeIndex: string,
    lastTimeRank: number,
    indexRank: number,
    rank: number,
}

export type HorseRaceResult = {
    horseId: string,
    horseName: string,
    averageLastTime: string,
    raceTimeIndex: string,
    results: RaceHorseRecordColumn[]
}

export type HorseRaceResultWithRank = 
    Omit<HorseRaceResult, "results">
    &
    {
        lastTimeRank: number,
        indexRank: number,
        rank: number,
    }
