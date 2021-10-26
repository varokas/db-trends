///////// IMPORTS ////////////
import * as fs from 'fs';
import * as mariadb from 'mariadb'

import * as _ from "lodash"
import { nanoid } from 'nanoid'

import createAPI from 'lambda-api';

import { Context, APIGatewayEvent } from "aws-lambda";
import { Connection } from "mariadb";

///////// VARIABLES ////////////
var rows = 10
var cols = 10


// Create Tables (not forced sync)
fs.promises.readFile("create_tables.sql", 'utf8')
  .then(createTable => executeQuery(createTable))
  .catch(err => console.log(err))

///////// ROUTES ////////////
const api = createAPI()

api.get('/api/booking', async (req, res) => {
  var round = await getCurrentRound()

  return await executeQuery("SELECT * FROM booking WHERE round = ?", [round])
});

api.get('/api/booking/booked', async (req, res) => {
  var round = await getCurrentRound()

  return await executeQuery("SELECT * FROM booking WHERE round = ? AND owner IS NOT NULL", [round])
});

api.get('/api/booking/owners', async (req, res) => {
  var round = await getCurrentRound()

  return await executeQuery("SELECT COUNT(counter) AS counts, owner FROM booking WHERE round = ? AND owner IS NOT NULL GROUP BY owner ORDER BY COUNT(counter) DESC", [round])
});

interface Booking {
  seat: string
  owner: string
  counter: number
}
api.post('/api/makeBooking', async (req, res) => {
  var round = await getCurrentRound()

  const bookings:Booking[] = [req.body]

  return makeBookings(round, bookings)
});
api.post('/api/makeBookings', async (req, res) => {
  var round = await getCurrentRound()

  const bookings:Booking[] = req.body

  return makeBookings(round, bookings)
});

api.post('/api/newRound', async (req, res) => {
  interface Request {
    rows: number
    cols: number
  }
  const reqBody: Request | undefined = req.body
  
  const rowBody = reqBody?.rows 
  const colBody = reqBody?.cols

  if (rowBody) {
    rows = rowBody
  }
  
  if (colBody) {
    cols = colBody
  }
 
  const newId = nanoid(10)

  var rowCodes = _.range(rows).map(i => String.fromCharCode(65 + i))
  var colCodes = _.range(cols)

  var codes = rowCodes.flatMap(r => colCodes.map(c => `${r}${c.toString().padStart(4, '0')}`))
  var insertParams = _.zip(Array(codes.length).fill(newId), codes)

  await execute(async (conn) => {
    await conn.query(`REPLACE INTO config(k,v) VALUES ('round','${newId}')`)
    await conn.batch("INSERT INTO booking(round, seat) VALUES (?, ?)", insertParams)
  })

  return { "roundId": newId, "seats": codes.length }
});


api.get('/:p', async (req, res) => {
  if (!req.params.p) {
    res.sendFile("static/index.html")
  }

  res.sendFile(`static/${req.params.p}`)
});

async function makeBookings(round: string, bookings: Booking[]) {
  const seats = bookings.map( b => b.seat )
  const reqBySeats = _.groupBy(bookings, r => r.seat)

  return await execute(async (conn) => {
    const bookingSeats = await conn.query("SELECT * FROM booking WHERE round = ? AND seat IN (?) FOR UPDATE", [round, seats])
    const bookingsBySeat = _.groupBy(bookingSeats, r => r.seat)
    const seatNotExist = _.difference(seats, Object.keys(bookingsBySeat))

    if (seatNotExist.length > 0) {
      throw new Error(`Seats not exists. Round: ${round}, Seats: ${seatNotExist}`)
    }

    var result = [];
    for (const seatIdx in seats) {
      const seat = seats[seatIdx]
      const owner = reqBySeats[seat][0].owner
      const newCounter = reqBySeats[seat][0].counter

      var counter = bookingsBySeat[seat][0].counter
      if (counter == null || counter < newCounter) {
        await conn.query("UPDATE booking SET owner=?, counter=? WHERE round = ? AND seat = ?", [owner, newCounter, round, seat])
        result.push({round, seat, owner, counter, newCounter})
      } else {
        result.push({
          "error": "Cannot take over seat",
          round, seat, counter, owner, newCounter
        })
      }
    }

    return result;
  })
}

// Lambda Handler
exports.handler = async (event:APIGatewayEvent, context:Context) => {
  return await api.run(event, context);
};

///////// DB Helpers ////////////
interface DBConfig {
    k: string
    v: string
}

async function getCurrentRound(): Promise<string> {
  var roundResult:DBConfig[] = await executeQuery("SELECT * FROM config where k = 'round'")
  if (roundResult.length == 0) {
    throw new Error("No current round")
  }

  return roundResult[0]["v"]
}

async function executeQuery(query:string, params?: [string]): Promise<any> {
  return execute(async (conn:Connection) => conn.query(query, params))
}

async function execute(command: (c: Connection) => Promise<any>) {
  let conn;
  let result;

  try {
    conn = await mariadb.createConnection({
      database: process.env.DB_NAME,
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      multipleStatements: true
    })

    await conn.beginTransaction();
    try {
      result = await command(conn);
      await conn.commit();
    } catch (err) {
      console.error("Error executing, reverting changes: ", err);
      await conn.rollback();
      throw err;
    }
  } catch (error) {
    console.log(error);
    throw error;
  } finally {
    if (conn) {
      await conn.end()
    }
  }

  return result;
}
