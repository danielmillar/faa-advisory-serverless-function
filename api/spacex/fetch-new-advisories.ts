import { VercelRequest, VercelResponse } from '@vercel/node';
import { MongoClient, ObjectId } from 'mongodb';

// Interfaces for the data structures
interface Geom {
  type: string;
  coordinates: number[][][];
}

interface Advisory {
  advisoryid: number;
  createtimestamp: string;
  status: string;
  advisorystarttime: string;
  advisoryendtime: string;
  type: string;
  summary: string;
  reason: string;
  details: string;
  createduserid: number;
  canceledbyuserid?: number;
  canceltime?: string;
  description: string;
  sourcelanguage: string;
  facility: string;
  anspid: string;
  fullname: string;
  displayname: string;
  country: string;
  isactive: boolean;
  boundarywkt?: string;
  geom?: Geom;
  parentansp?: string;
  facilitytype: string;
  displayname_es: string;
  anspurl?: string;
  pasaparticipating: boolean;
  vieworder?: number;
  flightlink: boolean;
  advisorystarttimestr: string;
  advisoryendtimestr: string;
  parsedDetails?: ParsedDetail[];
}

interface ParsedDetail {
  type: string;
  startDate: string; 
  endDate: string; 
  startTime: string; 
  endTime: string; 
  startDatetime: string; 
  endDatetime: string; 
}

interface Response {
  rows: Advisory[];
}

const monthMap: { [key: string]: number } = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

function getMonth(abbrev: string): number {
  const month = monthMap[abbrev.toUpperCase()];
  if (!month) throw new Error(`Invalid month abbreviation: ${abbrev}`);
  return month;
}

// Parse details string
function parseDetails(details: string, advisoryStartYear: number): ParsedDetail[] {
  const pattern = /(\w+ Launch Day(?: \(\d+\))?) (\d+\/\d+ \w+|\d+ \w+\/\d+ \w+) (\d{4}Z-\d{4}Z)/g;
  const parsedList: ParsedDetail[] = [];
  let match;

  while ((match = pattern.exec(details)) !== null) {
    const [_, type, datePart, timePart] = match;
    try {
      const [startDate, endDate] = parseDatePart(datePart, advisoryStartYear);
      const [startTime, endTime] = parseTimePart(timePart);
      const startDatetime = `${startDate}T${startTime}`;
      const endDatetime = `${endDate}T${endTime}`;

      parsedList.push({
        type,
        startDate,
        endDate,
        startTime,
        endTime,
        startDatetime,
        endDatetime,
      });
    } catch (e) {
      console.error(`Error parsing detail entry: ${match[0]}, error: ${e.message}`);
    }
  }
  return parsedList;
}

// Parse date part 
function parseDatePart(datePart: string, year: number): [string, string] {
  const parts = datePart.split('/').map((p) => p.trim());
  if (parts.length !== 2) throw new Error(`Invalid date part format: ${datePart}`);

  const [first, second] = parts;
  try {
    if (first.includes(' ')) {
      // Format: "day Mon" / "day Mon"
      const [day1, mon1] = first.split(' ');
      const [day2, mon2] = second.split(' ');
      const startDate = `${year}-${String(getMonth(mon1)).padStart(2, '0')}-${day1.padStart(2, '0')}`;
      const endDate = `${year}-${String(getMonth(mon2)).padStart(2, '0')}-${day2.padStart(2, '0')}`;
      return [startDate, endDate];
    } else {
      // Format: "day1" / "day2 Mon"
      const day1 = first;
      const [day2, mon] = second.split(' ');
      const month = getMonth(mon);
      const startDate = `${year}-${String(month).padStart(2, '0')}-${day1.padStart(2, '0')}`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-${day2.padStart(2, '0')}`;
      return [startDate, endDate];
    }
  } catch (e) {
    throw new Error(`Failed to parse date part: ${datePart}, error: ${e.message}`);
  }
}

// Parse time part
function parseTimePart(timePart: string): [string, string] {
  const [start, end] = timePart.split('-');
  try {
    const startTime = `${start.slice(0, 2)}:${start.slice(2, 4)}:00Z`;
    const endTime = `${end.slice(0, 2)}:${end.slice(2, 4)}:00Z`;
    return [startTime, endTime];
  } catch (e) {
    throw new Error(`Failed to parse time part: ${timePart}, error: ${e.message}`);
  }
}

// Fetch and process advisories
async function fetchAndProcessAdvisories(collection: any) {
  try {
    const response = await fetch('https://www.cadenaois.org/public_svcdynamic/?key=public_getadvisories');
    const data: Response = await response.json();

    const advisories = data.rows.filter((advisory) =>
      /(Starship|SpaceX|Starlink)/i.test(advisory.summary)
    );

    for (const advisory of advisories) {
      try {
        const startYear = new Date(advisory.advisorystarttime).getUTCFullYear();
        const parsedDetails = parseDetails(advisory.details, startYear);
        const updatedAdvisory = { ...advisory, parsedDetails };

        const result = await collection.replaceOne(
          { advisoryid: updatedAdvisory.advisoryid },
          updatedAdvisory,
          { upsert: true }
        );

        if (result.matchedCount > 0) {
          console.log(`Updated advisory ${updatedAdvisory.advisoryid}`);
        } else if (result.upsertedId) {
          console.log(`Inserted advisory ${updatedAdvisory.advisoryid}`);
        } else {
          console.log(`No action for advisory ${updatedAdvisory.advisoryid}`);
        }
      } catch (e) {
        console.error(`Error processing advisory ${advisory.advisoryid}: ${e.message}`);
      }
    }
  } catch (e) {
    console.error(`Error fetching advisories: ${e.message}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // MongoDB connection

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined');
  }
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db('advisories_db');
    const collection = db.collection('starship_advisories');

    if (req.method === 'POST') {
      // Fetch and process advisories
      await fetchAndProcessAdvisories(collection);
      return res.status(200).json({ message: 'Advisories processed' });
    } else {
      return res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (e) {
    console.error(`Error: ${e.message}`);
    return res.status(500).json({ message: `Server error: ${e.message}` });
  } finally {
    await client.close();
  }
}