import {
  DRAFT_TRAVEL_SPREADSHEET_ID,
  draftTravelSheetEditUrl,
  draftTravelSheetGidForTrip,
} from '@/lib/constants/draft-travel';

export type DraftTravelTripInfo = {
  airbnbAddress: string;
  checkIn: string;
  checkOut: string;
  draftTime: string;
  airbnbLink: string;
  note: string;
};

export type DraftTravelPerson = {
  name: string;
  attending: boolean;
  driving: boolean;
  arrivalTime: string;
  arrivalAirport: string;
  departure: string;
  departureAirport: string;
  availableForPickupDropoff: boolean;
  carCapacity: string;
  pickUp: string;
  pickUpTime: string;
  earlyStayLocation: string;
  dropOff: string;
};

export type DraftTravelSheetPayload = {
  source: 'sheet';
  trip: string;
  sheetUrl: string;
  tripInfo: DraftTravelTripInfo;
  people: DraftTravelPerson[];
  fetchedAt: string;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      // skip
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function clean(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function parseBool(value: string | undefined): boolean {
  const v = clean(value).toLowerCase();
  return v === 'true' || v === 'yes' || v === 'y' || v === '1';
}

function rowToRecord(headers: string[], values: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((header, idx) => {
    out[clean(header).toLowerCase()] = clean(values[idx]);
  });
  return out;
}

async function fetchCsvRange(gid: string, range: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${DRAFT_TRAVEL_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(gid)}&range=${encodeURIComponent(range)}`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) {
    throw new Error(`Sheet fetch failed (${res.status})`);
  }
  const text = await res.text();
  return parseCsv(text);
}

export async function fetchDraftTravelFromSheet(trip: string): Promise<DraftTravelSheetPayload> {
  const gid = draftTravelSheetGidForTrip(trip);
  if (!gid) {
    throw new Error(`No Google Sheet configured for trip ${trip}`);
  }

  const [tripRows, peopleRows] = await Promise.all([
    fetchCsvRange(gid, 'A1:F2'),
    fetchCsvRange(gid, 'A7:M100'),
  ]);

  const tripHeaders = tripRows[0]?.map((h) => clean(h)) ?? [];
  const tripValues = tripRows[1] ?? [];
  const tripMap = rowToRecord(tripHeaders, tripValues);

  const tripInfo: DraftTravelTripInfo = {
    airbnbAddress: tripMap['air bnb address'] || tripMap['airbnb address'] || '',
    checkIn: tripMap['check-in'] || tripMap['check in'] || '',
    checkOut: tripMap['check-out'] || tripMap['check out'] || '',
    draftTime: tripMap['draft time'] || '',
    airbnbLink: tripMap['air bnb link'] || tripMap['airbnb link'] || '',
    note: tripMap['note'] || '',
  };

  const peopleHeaders = peopleRows[0]?.map((h) => clean(h)) ?? [];
  const people: DraftTravelPerson[] = [];
  for (const values of peopleRows.slice(1)) {
    const rec = rowToRecord(peopleHeaders, values);
    const name = rec['name'];
    if (!name) continue;
    people.push({
      name,
      attending: parseBool(rec['attending']),
      driving: parseBool(rec['driving']),
      arrivalTime: rec['arrival time'] || '',
      arrivalAirport: rec['arrival airport'] || '',
      departure: rec['departure'] || '',
      departureAirport: rec['departure airport'] || '',
      availableForPickupDropoff: parseBool(rec['available for airport pick up/drop off']),
      carCapacity: rec['car capacity'] || '',
      pickUp: rec['pick up'] || '',
      pickUpTime: rec['pick up time'] || '',
      earlyStayLocation: rec['early stay location'] || '',
      dropOff: rec['drop off'] || '',
    });
  }

  return {
    source: 'sheet',
    trip,
    sheetUrl: draftTravelSheetEditUrl(gid),
    tripInfo,
    people,
    fetchedAt: new Date().toISOString(),
  };
}

export function tripUsesDraftTravelSheet(trip: string): boolean {
  return draftTravelSheetGidForTrip(trip) != null;
}
