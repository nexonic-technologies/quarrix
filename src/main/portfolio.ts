import * as db from './db';
import {EMPTY_PORTFOLIO,validatePortfolio} from '../shared/portfolio';
export function migratePortfolio(){db.raw().exec('CREATE TABLE IF NOT EXISTS career_portfolio (id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL)');}
export function getPortfolio(){const row=db.raw().prepare('SELECT data FROM career_portfolio WHERE id=1').get() as {data:string}|undefined;return row?validatePortfolio(JSON.parse(row.data)):{...EMPTY_PORTFOLIO};}
export function savePortfolio(value:unknown){const p=validatePortfolio(value);db.raw().prepare('INSERT INTO career_portfolio(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(p));return p;}
